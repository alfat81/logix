import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireEmployee } from '@/lib/auth'
import { employeeActor } from '@/lib/activity'
import { apiErrorResponse } from '@/lib/api-errors'
import { emitEvent } from '@/lib/events'
import { documentEventAudience } from '@/lib/audience'
import { deleteDocument } from '@/lib/documents'

type Params = { params: Promise<{ id: string }> }

// ─── Документ (Е) — кабинет менеджера ─────────────────────────────
// DELETE — удаление документа ЦЕЛИКОМ со всеми версиями (версий по
// одной нет: нумерация с дырками ломала бы историю). След остаётся в
// ленте сделки (document_deleted). Клиент и брокер удалять не могут —
// у внешних участников обмен только additive (свои загрузки видят
// все трое, «отменить отправку» = попросить менеджера).
export async function DELETE(req: NextRequest, { params }: Params) {
  const auth = await requireEmployee(req, { write: true })
  if (!auth.ok) return auth.response

  const { id } = await params
  try {
    const result = await deleteDocument(id, employeeActor(auth.employee))
    if (!result) {
      return NextResponse.json({ error: 'Документ не найден' }, { status: 404 })
    }
    return NextResponse.json({ message: `Документ «${result.title}» удалён` })
  } catch (e) {
    return apiErrorResponse(e, 'document DELETE', 'Не удалось удалить документ')
  }
}

// ─── DF-26/AUD-11: привязка документа к этапу заявки ────────────────
// PATCH { stageCode }: сотрудник меняет этап в раскрытой строке
// реестра (§3.3.7). Этап — этап ЭТОЙ заявки (документ лида этапов не
// имеет); null — снять привязку («—»). Событие document_stage_changed
// в той же транзакции (DoD 9); блокировки от привязки не зависят
// (гард по виду, §9) — регрессий нет.
const DocumentStagePatchSchema = z.object({
  stageCode: z.string().trim().max(40).nullable(),
})

export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await requireEmployee(req, { write: true })
  if (!auth.ok) return auth.response

  const { id } = await params
  try {
    const parsed = DocumentStagePatchSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Некорректные данные', details: parsed.error.flatten() },
        { status: 400 },
      )
    }
    const doc = await db.document.findUnique({
      where: { id },
      select: { id: true, title: true, orderId: true, leadId: true, isInternal: true, stageCode: true },
    })
    if (!doc || (!doc.orderId && !doc.leadId)) {
      return NextResponse.json({ error: 'Документ не найден' }, { status: 404 })
    }
    if (!doc.orderId) {
      return NextResponse.json(
        { error: 'Этап указывается только у документов заявки' },
        { status: 400 },
      )
    }
    const { stageCode } = parsed.data
    if (stageCode) {
      const stage = await db.orderStageInstance.findFirst({
        where: { orderId: doc.orderId, stageCode },
        select: { id: true },
      })
      if (!stage) {
        return NextResponse.json({ error: 'Этап не найден в этой заявке' }, { status: 400 })
      }
    }
    if (doc.stageCode === stageCode) {
      return NextResponse.json({ message: 'Этап не изменился' })
    }

    const updated = await db.$transaction(async (tx) => {
      await tx.document.update({ where: { id: doc.id }, data: { stageCode } })
      await emitEvent(tx, {
        target: { orderId: doc.orderId! },
        actor: employeeActor(auth.employee),
        type: 'document_stage_changed',
        description: stageCode
          ? `Документ «${doc.title}» привязан к этапу «${stageCode}»`
          : `С документа «${doc.title}» снята привязка к этапу`,
        documentId: doc.id,
        audience: documentEventAudience(doc.isInternal),
      })
      return { stageCode }
    })
    return NextResponse.json({ message: 'Этап документа обновлён', ...updated })
  } catch (e) {
    return apiErrorResponse(e, 'document PATCH', 'Не удалось изменить документ')
  }
}
