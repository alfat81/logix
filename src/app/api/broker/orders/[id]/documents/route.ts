import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireBroker } from '@/lib/broker-auth'
import { brokerActor } from '@/lib/activity'
import { apiErrorResponse } from '@/lib/api-errors'
import {
  DOC_PUBLIC_FIELDS,
  createDocumentOnDeal,
  parseDocumentCreateForm,
} from '@/lib/documents'

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
      where: { orderId: id, isInternal: false },
      select: DOC_PUBLIC_FIELDS,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    })
    return NextResponse.json({ documents })
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

    const parsed = await parseDocumentCreateForm(req)
    if (!parsed.ok) return parsed.response

    const document = await createDocumentOnDeal(
      { orderId: id },
      brokerActor(auth.broker),
      parsed.meta,
      parsed.file
    )
    return NextResponse.json({ document }, { status: 201 })
  } catch (e) {
    return apiErrorResponse(e, 'broker order documents POST', 'Не удалось загрузить документ')
  }
}
