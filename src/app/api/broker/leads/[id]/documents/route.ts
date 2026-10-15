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
      return NextResponse.json({ error: 'Лид не найден' }, { status: 404 })
    }

    const documents = await db.document.findMany({
      where: { leadId: id, isInternal: false },
      select: DOC_PUBLIC_FIELDS,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    })
    return NextResponse.json({ documents })
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
      return NextResponse.json({ error: 'Лид не найден' }, { status: 404 })
    }

    const parsed = await parseDocumentCreateForm(req)
    if (!parsed.ok) return parsed.response

    const document = await createDocumentOnDeal(
      { leadId: id },
      brokerActor(auth.broker),
      parsed.meta,
      parsed.file
    )
    return NextResponse.json({ document }, { status: 201 })
  } catch (e) {
    return apiErrorResponse(e, 'broker lead documents POST', 'Не удалось загрузить документ')
  }
}
