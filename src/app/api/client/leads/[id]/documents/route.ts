// no-event: события пишет ядро document-upload/document-confirm (document_created на confirm; pending-запись событие не пишет — документ ещё не существует)
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireClient } from '@/lib/client-auth'
import { clientActor } from '@/lib/activity'
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

// ─── Документы запроса (лида) — кабинет клиента (Е) ───────────────
// Роадмап 5: «клиент загружает проект документа в своём ЛК» — в том
// числе на этапе запроса (предварительный инвойс нужен брокеру для
// расчёта пошлины ещё до заявки, 5а). Только СВОИ запросы (404 на
// чужие — факт существования не раскрываем, паттерн И1), только
// НЕ внутренние документы (isInternal в where, не в проекции —
// тайна видимости держится запросом).

export async function GET(req: NextRequest, { params }: Params) {
  const auth = await requireClient(req)
  if (!auth.ok) return auth.response

  const { id } = await params
  try {
    const lead = await db.lead.findFirst({
      where: { id, customerId: auth.client.id },
      select: { id: true },
    })
    if (!lead) {
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
        kind: 'client',
        customerId: auth.client.id,
      }),
    })
  } catch (e) {
    return apiErrorResponse(e, 'client lead documents GET', 'Не удалось загрузить документы')
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  const auth = await requireClient(req)
  if (!auth.ok) return auth.response

  const { id } = await params
  try {
    const lead = await db.lead.findFirst({
      where: { id, customerId: auth.client.id },
      select: { id: true, order: { select: { id: true, number: true } } },
    })
    if (!lead) {
      return NextResponse.json({ error: 'Запрос не найден' }, { status: 404 })
    }
    if (lead.order) {
      return NextResponse.json(
        {
          error: `Запрос стал заявкой №${lead.order.number} — документы прикрепляйте в карточке заявки`,
        },
        { status: 409 }
      )
    }

    const parsed = await parseBody(req, DocumentCreateUploadSchema)
    if (!parsed.ok) return parsed.response
    // DF-11: шаг 1 — pending-запись и presigned PUT (байты грузит браузер).
    // Клиент не может создать внутренний документ: createPendingDocument
    // принудительно гасит isInternal для не-сотрудников.
    const result = await createPendingDocument(
      { leadId: id },
      clientActor(auth.client),
      parsed.data
    )
    // DF-02A (Блок 4): автор версии 1 — этот пользователь; в ответе
    // сразу имя человека (свой кабинет — коллега).
    const [document] = await projectDocumentAuthors([result.document], {
      kind: 'client',
      customerId: auth.client.id,
    })
    return NextResponse.json({ ...result, document, confirmUrl: `/api/client/document-versions/${result.version.id}/confirm` }, { status: 201 })
  } catch (e) {
    return apiErrorResponse(e, 'client lead documents POST', 'Не удалось загрузить документ')
  }
}
