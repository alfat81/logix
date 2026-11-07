// no-event: события пишут ядра (permits-db: permit_*/check_* через emitEvent) — роут только авторизует и валидирует
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireEmployee } from '@/lib/auth'
import { apiErrorResponse } from '@/lib/api-errors'
import { parseJsonBody } from '@/lib/api-request'
import { employeeActor } from '@/lib/activity'
import { PERMIT_REJECT_REASON_MAX } from '@/lib/permits'
import { rejectPermit, PermitLinkError } from '@/lib/permits-db'

type Params = { params: Promise<{ id: string }> }

const RejectSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(1, 'Укажите причину отклонения')
    .max(PERMIT_REJECT_REASON_MAX, `Причина — не длиннее ${PERMIT_REJECT_REASON_MAX} символов`),
})

// ─── POST /api/admin/permits/[id]/reject — «Отклонить» (§5.4/§11.2) ──
// submitted → pending с обязательной причиной; документ остаётся в
// заявке (замена версией или другой файл); контроль снова активен
// (скан и плашка). Причина и снимок отклонившего — в событии.

export async function POST(req: NextRequest, { params }: Params) {
  const auth = await requireEmployee(req, { write: true })
  if (!auth.ok) return auth.response

  const { id } = await params
  try {
    const parsed = await parseJsonBody(req, RejectSchema)
    if (!parsed.ok) return parsed.response
    const permit = await db.$transaction((tx) =>
      rejectPermit(id, employeeActor(auth.employee), parsed.data.reason, tx)
    )
    return NextResponse.json({ permit })
  } catch (e) {
    if (e instanceof PermitLinkError) {
      return NextResponse.json({ error: e.message }, { status: e.status })
    }
    return apiErrorResponse(e, 'admin permit reject POST', 'Не удалось отклонить документ')
  }
}
