import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireClient } from '@/lib/client-auth'
import { clientActor } from '@/lib/activity'
import { apiErrorResponse } from '@/lib/api-errors'
import {
  DOC_PUBLIC_FIELDS,
  createDocumentOnDeal,
  parseDocumentCreateForm,
} from '@/lib/documents'
import { projectDocumentAuthors } from '@/lib/actor-name'

type Params = { params: Promise<{ id: string }> }

// ─── Документы заявки — кабинет клиента (Е) ───────────────────────
// Свои заявки (404 на чужие), не внутренние документы. Статус заявки
// не ограничивает: закрывающие документы приходят, когда сделка уже
// завершена — обмен живёт всю жизнь сделки.

export async function GET(req: NextRequest, { params }: Params) {
  const auth = await requireClient(req)
  if (!auth.ok) return auth.response

  const { id } = await params
  try {
    const order = await db.order.findFirst({
      where: { id, customerId: auth.client.id },
      select: { id: true },
    })
    if (!order) {
      return NextResponse.json({ error: 'Заявка не найдена' }, { status: 404 })
    }

    const documents = await db.document.findMany({
      where: { orderId: id, isInternal: false },
      select: DOC_PUBLIC_FIELDS,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    })
    // DF-02A (Блок 4): автор версии — человек. Коллеги по компании
    // видят имена, чужие авторы — компанию (снимок как был).
    return NextResponse.json({
      documents: await projectDocumentAuthors(documents, {
        kind: 'client',
        customerId: auth.client.id,
      }),
    })
  } catch (e) {
    return apiErrorResponse(e, 'client order documents GET', 'Не удалось загрузить документы')
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  const auth = await requireClient(req)
  if (!auth.ok) return auth.response

  const { id } = await params
  try {
    const order = await db.order.findFirst({
      where: { id, customerId: auth.client.id },
      select: { id: true },
    })
    if (!order) {
      return NextResponse.json({ error: 'Заявка не найдена' }, { status: 404 })
    }

    const parsed = await parseDocumentCreateForm(req)
    if (!parsed.ok) return parsed.response

    const document = await createDocumentOnDeal(
      { orderId: id },
      clientActor(auth.client),
      parsed.meta,
      parsed.file
    )
    // DF-02A (Блок 4): автор версии 1 — этот пользователь; в ответе
    // сразу имя человека (свой кабинет — коллега).
    const [projected] = await projectDocumentAuthors([document], {
      kind: 'client',
      customerId: auth.client.id,
    })
    return NextResponse.json({ document: projected }, { status: 201 })
  } catch (e) {
    return apiErrorResponse(e, 'client order documents POST', 'Не удалось загрузить документ')
  }
}
