import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { authenticateBrokerLogin } from '@/lib/company-users'
import {
  createBrokerSession,
  brokerSessionCookieOptions,
} from '@/lib/broker-auth'
import { normalizePhone } from '@/lib/phone'
import { apiErrorResponse } from '@/lib/api-errors'

// POST /api/auth/broker/login — вход в урезанный ЛК брокера (Д).
// Body: { phone, password } — UX прежний: логин это телефон брокера,
// пароль выдаёт менеджер при создании (POST /api/admin/brokers);
// саморегистрации нет, как у остальных внешних порталов (Г2/И1).
// DF-02A: учётка — основной пользователь брокера (BrokerUser), хеш
// перенесён миграцией df_02a_company_users без изменения — существующие
// брокеры входят по тем же данным. Вход блокирует деактивация человека
// ИЛИ компании. Порядок 401/403 и аудит попыток — общая точка с
// клиентским входом (lib/company-users.ts).
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    const phone = normalizePhone(String(body?.phone ?? ''))
    const password = typeof body?.password === 'string' ? body.password : ''

    if (!phone || !password) {
      return NextResponse.json({ error: 'Укажите телефон и пароль' }, { status: 400 })
    }

    const result = await authenticateBrokerLogin(req, phone, password)
    if (result.kind === 'rate-limited') return result.response
    if (result.kind === 'invalid') {
      return NextResponse.json({ error: 'Неверный телефон или пароль' }, { status: 401 })
    }
    if (result.kind === 'closed') {
      return NextResponse.json({ error: result.message }, { status: 403 })
    }

    const { user } = result
    await db.brokerUser.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
    const token = await createBrokerSession(user.id)

    // Форма ответа прежняя; userName — аддитивно: человек в сессии.
    const res = NextResponse.json({
      authenticated: true,
      broker: {
        id: user.brokerId,
        companyName: user.broker.companyName,
        phone: user.phone,
        userName: user.name,
      },
    })
    res.cookies.set({ ...brokerSessionCookieOptions(), value: token })
    return res
  } catch (e) {
    return apiErrorResponse(e, 'broker/login', 'Ошибка авторизации')
  }
}
