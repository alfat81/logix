// no-event: события пишет ядро document-upload/document-confirm (document_created на confirm; pending-запись событие не пишет — документ ещё не существует)
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireEmployee } from '@/lib/auth'
import { employeeActor } from '@/lib/activity'
import { apiErrorResponse } from '@/lib/api-errors'
import { getSetting } from '@/lib/settings'
import { DOC_LIST_READY_WHERE, DOC_PUBLIC_FIELDS } from '@/lib/documents'
import {
  createPendingDocument,
  DocumentCreateUploadSchema,
  parseBody,
} from '@/lib/document-upload'
import { projectDocumentAuthors, STAFF_READER } from '@/lib/actor-name'

type Params = { params: Promise<{ id: string }> }

// ─── Документы лида (Е, роадмап 5) — кабинет менеджера ────────────
// GET  — все документы лида (включая внутренние — менеджер видит всё).
// POST — загрузить документ (multipart: type, title, isInternal,
//        comment, file). Лид с заявкой (won) — 409: сделка живёт
//        заявкой, документы при конвертации переехали туда (симметрия
//        с подключением брокера Д: «подключайте к заявке»).

export async function GET(req: NextRequest, { params }: Params) {
  const auth = await requireEmployee(req)
  if (!auth.ok) return auth.response

  const { id } = await params
  try {
    const lead = await db.lead.findUnique({
      where: { id },
      select: { id: true },
    })
    if (!lead) {
      return NextResponse.json({ error: 'Запрос не найден' }, { status: 404 })
    }

    const documents = await db.document.findMany({
      where: { leadId: id, ...DOC_LIST_READY_WHERE },
      select: DOC_PUBLIC_FIELDS,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    })
    // DF-02A (Блок 4): автор версии — человек; сотруднику —
    // «Имя (Компания)» (устаревшие версии — компания, как было).
    return NextResponse.json({
      maxMb: await getSetting('files.max_mb'),
      documents: await projectDocumentAuthors(documents, STAFF_READER),
    })
  } catch (e) {
    return apiErrorResponse(e, 'lead documents GET', 'Не удалось загрузить документы')
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  const auth = await requireEmployee(req, { write: true })
  if (!auth.ok) return auth.response

  const { id } = await params
  try {
    const lead = await db.lead.findUnique({
      where: { id },
      select: { id: true, status: true, order: { select: { id: true, number: true } } },
    })
    if (!lead) {
      return NextResponse.json({ error: 'Запрос не найден' }, { status: 404 })
    }
    if (lead.order) {
      return NextResponse.json(
        {
          error: `Сделка перешла в заявку №${lead.order.number} — прикрепляйте документы к заявке`,
        },
        { status: 409 }
      )
    }

    const parsed = await parseBody(req, DocumentCreateUploadSchema)
    if (!parsed.ok) return parsed.response
    // DF-11: шаг 1 — pending-запись и presigned PUT (байты грузит браузер).
    const result = await createPendingDocument(
      { leadId: id },
      employeeActor(auth.employee),
      parsed.data
    )
    return NextResponse.json({ ...result, confirmUrl: `/api/admin/document-versions/${result.version.id}/confirm` }, { status: 201 })
  } catch (e) {
    return apiErrorResponse(e, 'lead documents POST', 'Не удалось загрузить документ')
  }
}
