import { NextRequest, NextResponse } from 'next/server'
import { requireEmployee } from '@/lib/auth'
import { db } from '@/lib/db'
import { apiErrorResponse } from '@/lib/api-errors'
import { createTotpSetup } from '@/lib/totp-db'

// GET /api/admin/profile/totp/setup — свежий секрет для включения
// TOTP (DF-09). Секрет показывается QR (otpauth://) и текстом для
// ручного ввода; сохраняется только после подтверждения кодом
// (POST /api/admin/profile/totp). Повторный вызов даёт НОВЫЙ секрет —
// прежний так и остаётся несохранённым.
//
// Ключ TOTP_ENCRYPTION_KEY проверяется сразу: без него включение
// всё равно упадёт на POST (шифрование секрета), честнее сообщить
// до сканирования QR.

export async function GET(req: NextRequest) {
  const auth = await requireEmployee(req)
  if (!auth.ok) return auth.response
  try {
    if (!process.env.TOTP_ENCRYPTION_KEY) {
      return NextResponse.json(
        {
          error:
            'Двухфакторный вход не настроен на сервере: задайте переменную окружения TOTP_ENCRYPTION_KEY (см. DEPLOY.md).',
        },
        { status: 503 }
      )
    }
    // account QR — телефон сотрудника: ASCII гарантированно влезает в QR
    // (кириллическое имя в encodeURIComponent упирается в 152 байта v8-M)
    const row = await db.employee.findUnique({
      where: { id: auth.employee.id },
      select: { phone: true },
    })
    const setup = createTotpSetup(auth.employee, row?.phone ?? auth.employee.id)
    return NextResponse.json(setup)
  } catch (e) {
    return apiErrorResponse(e, 'profile/totp/setup GET', 'Не удалось создать секрет')
  }
}
