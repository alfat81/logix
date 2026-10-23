import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { verifyPassword } from '@/lib/password'
import {
  createClientSession,
  clientSessionCookieOptions,
} from '@/lib/client-auth'
import { normalizePhone } from '@/lib/phone'
import { apiErrorResponse } from '@/lib/api-errors'
import { checkLoginGuard, recordLoginAttempt } from '@/lib/login-guard'

// POST /api/auth/client/login — вход в клиентский кабинет (И1).
// Body: { phone, password } — логин это телефон клиента из
// справочника, пароль выдаёт менеджер (POST customers/[id]/access);
// саморегистрации/восстановления в MVP нет — без SMS-верификации
// телефона «регистрация на любой номер» открывала бы чужие заявки.
// isActive блокирует вход (в отличие от подрядчика): деактивированный
// клиент — бывший клиент, кабинет закрыт (см. lib/client-auth.ts).
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    const phone = normalizePhone(String(body?.phone ?? ''))
    const password = typeof body?.password === 'string' ? body.password : ''

    if (!phone || !password) {
      return NextResponse.json({ error: 'Укажите телефон и пароль' }, { status: 400 })
    }

    // З2: лимиты перебора — ДО обращения к учёткам и сверки пароля
    // (общие с входами сотрудников и подрядчиков: перебор любой
    // «двери» запирает все, см. lib/login-guard.ts). 400 выше в
    // аудит не пишется
    const guard = await checkLoginGuard(req, phone)
    if (guard) return guard

    // Телефон клиента не @unique в схеме (в отличие от Employee и
    // Contractor): все пути создания клиентов и так дедуплицируют по
    // телефону (POST customers — 409 на дубль, конвертация В4 —
    // find-or-create), а добавление уникального индекса на живой базе
    // с возможными дублями ломало бы принцип очереди «db:push не
    // разрушающий». Поэтому findFirst, а не findUnique: при
    // патологических дублях (ручная правка БД) вход детерминирован —
    // берётся самый старый клиент с этим телефоном.
    // Только клиенты с выданным доступом: если в справочнике есть
    // дубли по телефону, вход не должен попадать на дубль без пароля
    const customer = await db.customer.findFirst({
      where: { phone, password: { not: null } },
      orderBy: { createdAt: 'asc' },
    })
    // Одна формулировка на «нет такого», «доступ не выдан» (password
    // null) и «не тот пароль» — не раскрываем ни перечень логинов,
    // ни у кого из них выдан доступ. Провал пишется в аудит перебора
    if (!customer || !customer.password || !verifyPassword(password, customer.password)) {
      await recordLoginAttempt(req, { kind: 'client', login: phone, success: false })
      return NextResponse.json({ error: 'Неверный телефон или пароль' }, { status: 401 })
    }

    // Деактивирован = доступ закрыт (шапка lib/client-auth.ts).
    // Порядок отличается от employee-входа (там isActive до сверки
    // пароля) осознанно: 403 «доступ закрыт» показываем только тому,
    // кто пароль уже сверил, — статус деактивации не раскрывается
    // перебору. 403 в аудит не пишется: пароль ВЕРНЫЙ, это состояние
    // аккаунта, а не сигнал перебора
    if (!customer.isActive) {
      return NextResponse.json(
        { error: 'Доступ в кабинет закрыт. Обратитесь к менеджеру.' },
        { status: 403 }
      )
    }

    // Пароль сверен — успех в аудит (в лимиты успехи не идут)
    await recordLoginAttempt(req, { kind: 'client', login: phone, success: true })

    const token = await createClientSession(customer.id)

    const res = NextResponse.json({
      authenticated: true,
      client: {
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        email: customer.email,
      },
    })
    res.cookies.set({ ...clientSessionCookieOptions(), value: token })
    return res
  } catch (e) {
    return apiErrorResponse(e, 'client/login', 'Ошибка авторизации')
  }
}
