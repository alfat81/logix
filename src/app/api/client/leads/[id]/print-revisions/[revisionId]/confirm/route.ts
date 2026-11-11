import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireClient } from '@/lib/client-auth'
import { apiErrorResponse } from '@/lib/api-errors'
import { clientActor } from '@/lib/activity'
import { confirmPrintRevision, parsePrintRevisionConfirm } from '@/lib/print-revisions'
import { ownLeadOr404 } from '@/lib/client-scope'

type Params = { params: Promise<{ id: string; revisionId: string }> }

// POST /api/client/leads/[id]/print-revisions/[revisionId]/confirm —
// подтверждение печатной редакции клиентом в кабинете (DF-27 волна 2,
// Р-3/D75): согласие с составом сведений заявки на дату; предварительная
// оценка цены окончательным обязательством не становится (D41/D73).
// no-event: событие lead_print_revision_confirmed пишет ядро
// lib/print-revisions.ts. Скоупинг — только собственный запрос.
export async function POST(req: NextRequest, { params }: Params) {
  const auth = await requireClient(req)
  if (!auth.ok) return auth.response

  const { id, revisionId } = await params
  try {
    const body = await parsePrintRevisionConfirm(req)
    if (!body.ok) {
      return NextResponse.json({ error: body.error }, { status: body.status })
    }
    // Скоупинг: редакция подтверждается только на СВОЁМ запросе
    const lead = await ownLeadOr404(db, id, auth.client.id)
    if (!lead) {
      return NextResponse.json({ error: 'Запрос не найден' }, { status: 404 })
    }
    const actor = clientActor(auth.client)
    const result = await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Lead" WHERE id = ${id} FOR UPDATE`
      return confirmPrintRevision(tx, id, revisionId, 'client', actor, {
        contentHash: body.contentHash,
        method: 'client_portal',
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
        : 'Ваше подтверждение зафиксировано — ожидается подтверждение менеджера',
    })
  } catch (e) {
    return apiErrorResponse(e, 'print-revision confirm (client)', 'Не удалось подтвердить редакцию')
  }
}
