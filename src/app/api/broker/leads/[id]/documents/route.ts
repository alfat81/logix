// no-event: события пишет ядро document-upload/document-confirm (document_created на confirm; pending-запись событие не пишет — документ ещё не существует)
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireBroker } from '@/lib/broker-auth'
import { brokerActor } from '@/lib/activity'
import { apiErrorResponse } from '@/lib/api-errors'
import { getSetting } from '@/lib/settings'
import { DOC_LIST_READY_WHERE, DOC_PUBLIC_FIELDS } from '@/lib/documents'
import {
  createPendingDocument,
  DocumentCreateUploadSchema,
  parseBody,
} from '@/lib/document-upload'
import { projectDocumentAuthors } from '@/lib/actor-name'

type Params = { params: Promise<{ id: string }> }

// ─── Документы лида расчёта — кабинет брокера (Е) ─────────────────
// Роадмап 5а/5: брокер, связанный с лидом через LeadBroker, видит ВСЕ
// не внутренние документы сделки — «с самого начала, не только по
// своему этапу». Лид с заявкой (won) — 404: сделка живёт заявкой (Д).
// Создавать документы брокер может: таможенные документы (ДТ) и
// правки рождаются у него.

export async function GET(req: NextRequest, { params }: Params) {
  const auth = await requireBroker(req)
  if (!auth.ok) return auth.response

  const { id } = await params
  try {
    const link = await db.leadBroker.findUnique({
      where: { leadId_brokerId: { leadId: id, brokerId: auth.broker.id } },
      select: {
        id: true,
        lead: {
          select: { order: { select: { id: true } } },
        },
      },
    })
    if (!link || link.lead.order) {
      return NextResponse.json({ error: 'Запрос не найден' }, { status: 404 })
    }

    const documents = await db.document.findMany({
      where: { leadId: id, isInternal: false, ...DOC_LIST_READY_WHERE },
      select: DOC_PUBLIC_FIELDS,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    })
    // DF-02A (Блок 4): автор версии — человек. Коллеги по компании
    // видят имена, чужие авторы — компанию (снимок как был).
    return NextResponse.json({
      maxMb: await getSetting('files.max_mb'),
      documents: await projectDocumentAuthors(documents, {
        kind: 'broker',
        brokerId: auth.broker.id,
      }),
    })
  } catch (e) {
    return apiErrorResponse(e, 'broker lead documents GET', 'Не удалось загрузить документы')
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  const auth = await requireBroker(req)
  if (!auth.ok) return auth.response

  const { id } = await params
  try {
    const link = await db.leadBroker.findUnique({
      where: { leadId_brokerId: { leadId: id, brokerId: auth.broker.id } },
      select: { id: true, lead: { select: { order: { select: { id: true } } } } },
    })
    if (!link || link.lead.order) {
      return NextResponse.json({ error: 'Запрос не найден' }, { status: 404 })
    }

    const parsed = await parseBody(req, DocumentCreateUploadSchema)
    if (!parsed.ok) return parsed.response
    // DF-11: шаг 1 — pending-запись и presigned PUT (байты грузит браузер).
    const result = await createPendingDocument(
      { leadId: id },
      brokerActor(auth.broker),
      parsed.data
    )
    // DF-02A (Блок 4): автор версии 1 — этот пользователь; в ответе
    // сразу имя человека (свой кабинет — коллега).
    const [document] = await projectDocumentAuthors([result.document], {
      kind: 'broker',
      brokerId: auth.broker.id,
    })
    return NextResponse.json({ ...result, document, confirmUrl: `/api/broker/document-versions/${result.version.id}/confirm` }, { status: 201 })
  } catch (e) {
    return apiErrorResponse(e, 'broker lead documents POST', 'Не удалось загрузить документ')
  }
}
