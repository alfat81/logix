import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireEmployee } from '@/lib/auth'
import { apiErrorResponse } from '@/lib/api-errors'
import { employeeActor } from '@/lib/activity'
import { CompanyUserError, rebindCustomerUser } from '@/lib/company-users'

type Params = { params: Promise<{ id: string }> }

// no-event: событие customer_user_rebound пишет ядро
// rebindCustomerUser (company-users.ts) в той же транзакции —
// роут только авторизует и валидирует (IC-03, образец волны 1).

// ─── BL-9: перепривязка пользователя к другой компании ───────────────
// (поток A волна 2, DF-25; план ред. 3 §5.3, контракт §8). Отдельная
// операция (А5: телефон и компания — разные операции). Не-primary,
// целевая компания существует и активна, целевая ≠ текущая.
// Транзакция в lib: блокировка строки → перепроверка → смена
// customerId → гашение всех сессий пользователя → событие
// customer_user_rebound. Доступ к данным прежней компании НЕ
// передаётся (скоупинг от customerId — client-auth.ts), история
// прежней компании сохраняется (actorName-снимки в событиях).

const RebindSchema = z.object({
  userId: z.string().min(1),
  targetCustomerId: z.string().min(1),
})

export async function POST(req: NextRequest, { params }: Params) {
  const auth = await requireEmployee(req, { write: true })
  if (!auth.ok) return auth.response

  const { id } = await params
  try {
    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Некорректный JSON в теле запроса' }, { status: 400 })
    }
    const parsed = RebindSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Некорректные данные', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const updated = await db.$transaction((tx) =>
      rebindCustomerUser(tx, id, parsed.data.userId, parsed.data.targetCustomerId, employeeActor(auth.employee))
    )
    return NextResponse.json({ ok: true, customerId: updated.customerId })
  } catch (e) {
    if (e instanceof CompanyUserError) {
      return NextResponse.json({ error: e.message }, { status: e.status })
    }
    return apiErrorResponse(e, 'access/rebind POST', 'Не удалось перепривязать пользователя')
  }
}
