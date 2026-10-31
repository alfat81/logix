import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireEmployee } from '@/lib/auth'
import { verifyPassword } from '@/lib/password'
import { apiErrorResponse } from '@/lib/api-errors'
import { disableTotp, enableTotp, TotpCodeMismatchError } from '@/lib/totp-db'
import { TotpNotConfiguredError } from '@/lib/totp-crypto'

// ─── Профиль: двухфакторная аутентификация (DF-09) ───────────────────
// GET    — статус TOTP текущего сотрудника (мастер и менеджер: карточка
//          DF-09 — manager включает по желанию).
// POST   — включение: { secret, code } (секрет из GET setup, код из
//          приложения) → одноразовые коды восстановления (наружу один
//          раз, в БД — хеши). Событие totp_enabled в той же транзакции.
// DELETE — выключение с подтверждением паролем. Событие totp_disabled.
// Доступ к чужому TOTP через эти роуты невозможен по построению:
// операции работают только с учёткой из сессии (employee.id), а не с id
// из тела запроса.

const EnableSchema = z.object({
  secret: z.string().min(32).max(64),
  code: z.string().min(6).max(16),
})

const DisableSchema = z.object({
  password: z.string().min(1),
})

const NOT_CONFIGURED =
  'Двухфакторный вход не настроен на сервере: задайте переменную окружения TOTP_ENCRYPTION_KEY (см. DEPLOY.md).'

export async function GET(req: NextRequest) {
  const auth = await requireEmployee(req)
  if (!auth.ok) return auth.response
  try {
    const row = await db.employee.findUnique({
      where: { id: auth.employee.id },
      select: { totpEnabledAt: true },
    })
    return NextResponse.json({
      enabled: Boolean(row?.totpEnabledAt),
      enabledAt: row?.totpEnabledAt ?? null,
    })
  } catch (e) {
    return apiErrorResponse(e, 'profile/totp GET', 'Не удалось получить статус')
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireEmployee(req, { write: true })
  if (!auth.ok) return auth.response
  try {
    const parsed = EnableSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Некорректный запрос', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }
    const recoveryCodes = await enableTotp(auth.employee, parsed.data.secret, parsed.data.code)
    return NextResponse.json({ recoveryCodes })
  } catch (e) {
    if (e instanceof TotpNotConfiguredError) {
      return NextResponse.json({ error: NOT_CONFIGURED }, { status: 503 })
    }
    if (e instanceof TotpCodeMismatchError) {
      return NextResponse.json({ error: e.message }, { status: e.statusCode })
    }
    return apiErrorResponse(e, 'profile/totp POST', 'Не удалось включить двухфакторный вход')
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await requireEmployee(req, { write: true })
  if (!auth.ok) return auth.response
  try {
    const parsed = DisableSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: 'Введите пароль для подтверждения' }, { status: 400 })
    }
    const row = await db.employee.findUnique({
      where: { id: auth.employee.id },
      select: { password: true },
    })
    if (!row || !verifyPassword(parsed.data.password, row.password)) {
      return NextResponse.json({ error: 'Неверный пароль' }, { status: 400 })
    }
    await disableTotp(auth.employee)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return apiErrorResponse(e, 'profile/totp DELETE', 'Не удалось выключить двухфакторный вход')
  }
}
