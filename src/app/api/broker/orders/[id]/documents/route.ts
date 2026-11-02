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

// ─── Документы заявки — кабинет брокера (Е) ───────────────────────
// Видимость заявки целиком (5а): связь OrderBroker открывает все не
// внутренние документы сделки, статус заявки не важен — обмен живёт
// и в исполнении (ДТ, разрешительные, правки).

export async function GET(req: NextRequest, { params }: Params) {
  const auth = await requireBroker(req)
  if (!auth.ok) return auth.response

  const { id } = await params
  try {
    const link = await db.orderBroker.findUnique({
      where: { orderId_brokerId: { orderId: id, brokerId: auth.broker.id } },
      select: { id: true },
    })
    if (!link) {
      return NextResponse.json({ error: 'Заявка не найдена' }, { status: 404 })
    }

    const documents = await db.document.findMany({
      where: { orderId: id, isInternal: false, ...DOC_LIST_READY_WHERE },
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
    return apiErrorResponse(e, 'broker order documents GET', 'Не удалось загрузить документы')
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  const auth = await requireBroker(req)
  if (!auth.ok) return auth.response

  const { id } = await params
  try {
    const link = await db.orderBroker.findUnique({
      where: { orderId_brokerId: { orderId: id, brokerId: auth.broker.id } },
      select: { id: true },
    })
    if (!link) {
      return NextResponse.json({ error: 'Заявка не найдена' }, { status: 404 })
    }

    const parsed = await parseBody(req, DocumentCreateUploadSchema)
    if (!parsed.ok) return parsed.response
    // DF-11: шаг 1 — pending-запись и presigned PUT (байты грузит браузер).
    const result = await createPendingDocument(
      { orderId: id },
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
    return apiErrorResponse(e, 'broker order documents POST', 'Не удалось загрузить документ')
  }
}
