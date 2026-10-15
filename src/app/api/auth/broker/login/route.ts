import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { verifyPassword } from '@/lib/password'
import {
  createBrokerSession,
  brokerSessionCookieOptions,
} from '@/lib/broker-auth'
import { normalizePhone } from '@/lib/phone'
import { apiErrorResponse } from '@/lib/api-errors'
import { checkLoginGuard, recordLoginAttempt } from '@/lib/login-guard'

// POST /api/auth/broker/login — вход в урезанный ЛК брокера (Д).
// Body: { phone, password } — логин это телефон брокера из
// справочника, пароль выдаёт менеджер при создании (POST
// /api/admin/brokers); саморегистрации нет, как у остальных внешних
// порталов (Г2/И1). isActive блокирует вход (паттерн клиента И1):
// деактивированный брокер — бывший участник, видеть сделки он больше
// не должен (в отличие от мягкого исключения подрядчика из пула).
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    const phone = normalizePhone(String(body?.phone ?? ''))
    const password = typeof body?.password === 'string' ? body.password : ''

    if (!phone || !password) {
      return NextResponse.json({ error: 'Укажите телефон и пароль' }, { status: 400 })
    }

    // З2: лимиты перебора — ДО обращения к учёткам и сверки пароля
    // (общие с входами сотрудников, подрядчиков и клиентов: перебор
    // любой «двери» запирает все, см. lib/login-guard.ts). 400 выше в
    // аудит не пишется
    const guard = await checkLoginGuard(req, phone)
    if (guard) return guard

    const broker = await db.broker.findUnique({ where: { phone } })
    // Одна формулировка на «нет такого» и «не тот пароль» — не
    // раскрываем перечень логинов. Провал пишется в аудит перебора
    if (!broker || !verifyPassword(password, broker.password)) {
      await recordLoginAttempt(req, { kind: 'broker', login: phone, success: false })
      return NextResponse.json({ error: 'Неверный телефон или пароль' }, { status: 401 })
    }

    // Деактивирован = доступ закрыт (шапка lib/broker-auth.ts).
    // Порядок как у клиента (И1): 403 «доступ закрыт» показываем
    // только тому, кто пароль уже сверил, — статус деактивации не
    // раскрывается перебору. 403 в аудит не пишется: пароль ВЕРНЫЙ,
    // это состояние аккаунта, а не сигнал перебора
    if (!broker.isActive) {
      return NextResponse.json(
        { error: 'Доступ в портал закрыт. Обратитесь к менеджеру.' },
        { status: 403 }
      )
    }

    // Пароль сверен — успех в аудит (в лимиты успехи не идут)
    await recordLoginAttempt(req, { kind: 'broker', login: phone, success: true })

    const token = await createBrokerSession(broker.id)

    const res = NextResponse.json({
      authenticated: true,
      broker: {
        id: broker.id,
        companyName: broker.companyName,
        phone: broker.phone,
      },
    })
    res.cookies.set({ ...brokerSessionCookieOptions(), value: token })
    return res
  } catch (e) {
    return apiErrorResponse(e, 'broker/login', 'Ошибка авторизации')
  }
}
