import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { authenticateCustomerLogin } from '@/lib/company-users'
import {
  createClientSession,
  clientSessionCookieOptions,
} from '@/lib/client-auth'
import { normalizePhone } from '@/lib/phone'
import { apiErrorResponse } from '@/lib/api-errors'

// POST /api/auth/client/login — вход в клиентский кабинет (И1, DF-02A).
// Body: { phone, password } — UX прежний: логин это телефон, пароль
// выдаёт менеджер (POST customers/[id]/access); саморегистрации/
// восстановления в MVP нет — без SMS-верификации телефона «регистрация
// на любой номер» открывала бы чужие заявки.
// DF-02A: учётка — основной пользователь компании (CustomerUser), хеш
// перенесён миграцией df_02a_company_users без изменения — существующие
// клиенты входят по тем же данным. Вход блокирует деактивация человека
// ИЛИ его компании. Актёр/автор (userId) маршрутизируется сессией —
// see lib/client-auth.ts.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    const phone = normalizePhone(String(body?.phone ?? ''))
    const password = typeof body?.password === 'string' ? body.password : ''

    if (!phone || !password) {
      return NextResponse.json({ error: 'Укажите телефон и пароль' }, { status: 400 })
    }

    // Guard перебора, сверка пароля, аудит попыток и 401/403 — общая
    // точка для клиента и брокера (lib/company-users.ts); порядок и
    // формулировки старого входа сохранены дословно.
    const result = await authenticateCustomerLogin(req, phone, password)
    if (result.kind === 'rate-limited') return result.response
    if (result.kind === 'invalid') {
      return NextResponse.json({ error: 'Неверный телефон или пароль' }, { status: 401 })
    }
    if (result.kind === 'closed') {
      return NextResponse.json({ error: result.message }, { status: 403 })
    }

    const { user } = result
    await db.customerUser.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
    const token = await createClientSession(user.id)

    // Форма ответа прежняя (кабинет не меняется); userName — аддитивно:
    // человек в сессии (шапка/журналы подключаются в Блоках 4–5).
    const res = NextResponse.json({
      authenticated: true,
      client: {
        id: user.customerId,
        name: user.customer.name,
        phone: user.phone,
        email: user.email,
        userName: user.name,
      },
    })
    res.cookies.set({ ...clientSessionCookieOptions(), value: token })
    return res
  } catch (e) {
    return apiErrorResponse(e, 'client/login', 'Ошибка авторизации')
  }
}
