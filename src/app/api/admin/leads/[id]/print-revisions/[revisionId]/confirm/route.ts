import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireEmployee } from '@/lib/auth'
import { apiErrorResponse } from '@/lib/api-errors'
import { employeeActor } from '@/lib/activity'
import { confirmPrintRevision, parsePrintRevisionConfirm } from '@/lib/print-revisions'

type Params = { params: Promise<{ id: string; revisionId: string }> }

// POST /api/admin/leads/[id]/print-revisions/[revisionId]/confirm —
// подтверждение печатной редакции менеджером (DF-27 волна 2, Р-3/D75).
// no-event: событие lead_print_revision_confirmed пишет ядро
// lib/print-revisions.ts в той же транзакции. Подтверждение менеджера
// не заменяет подтверждение клиента; повтор — 409; факт правки редакции
// менеджером подтверждением НЕ считается.
export async function POST(req: NextRequest, { params }: Params) {
  const auth = await requireEmployee(req, { write: true })
  if (!auth.ok) return auth.response

  const { id, revisionId } = await params
  try {
    const body = await parsePrintRevisionConfirm(req)
    if (!body.ok) {
      return NextResponse.json({ error: body.error }, { status: body.status })
    }
    const actor = employeeActor(auth.employee)
    const result = await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Lead" WHERE id = ${id} FOR UPDATE`
      return confirmPrintRevision(tx, id, revisionId, 'manager', actor, {
        contentHash: body.contentHash,
        method: 'manager_on_behalf',
        comment: body.comment,
      })
    })
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json({
      ok: true,
      bothConfirmed: result.bothConfirmed,
      message: result.bothConfirmed
        ? 'Редакция подтверждена обеими сторонами'
        : 'Подтверждение менеджера зафиксировано — ожидается подтверждение клиента',
    })
  } catch (e) {
    return apiErrorResponse(e, 'print-revision confirm (manager)', 'Не удалось подтвердить редакцию')
  }
}
