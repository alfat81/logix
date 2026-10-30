// no-event: события пишет ядро permits-db (permit_added/permit_received/permit_waived/permit_overdue через emitEvent) — роут только авторизует и валидирует
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireBroker } from '@/lib/broker-auth'
import { apiErrorResponse } from '@/lib/api-errors'
import { brokerActor } from '@/lib/activity'
import { CreatePermitSchema } from '@/lib/permits'
import { PERMIT_EXTERNAL_FIELDS, createPermit } from '@/lib/permits-db'
import { brokerConnectedToLead, resolveLeadDealTarget } from '@/lib/permits-access'

type Params = { params: Promise<{ id: string }> }

// ─── GET/POST /api/broker/leads/[id]/permits — разрешительные (портал брокера, DF-16) ──
// Карточка DF-16: «кто добавляет: брокер и сотрудники». Брокер видит
// строки своей сделки (наружная проекция — staffNote не отдаётся) и
// добавляет новые. Цель — заявка, если лид уже конвертирован.

export async function GET(req: NextRequest, { params }: Params) {
  const auth = await requireBroker(req)
  if (!auth.ok) return auth.response

  const { id } = await params
  try {
    const connected = await brokerConnectedToLead(id, auth.broker.id)
    if (!connected) return NextResponse.json({ error: 'Запрос не найден' }, { status: 404 })

    const lead = await db.lead.findUnique({ where: { id }, select: { order: { select: { id: true } } } })
    if (!lead) return NextResponse.json({ error: 'Запрос не найден' }, { status: 404 })

    const permits = await db.permitRequirement.findMany({
      where: lead.order ? { orderId: lead.order.id } : { leadId: id },
      select: PERMIT_EXTERNAL_FIELDS,
      orderBy: [{ isBlocking: 'desc' }, { createdAt: 'asc' }],
    })
    return NextResponse.json({ permits })
  } catch (e) {
    return apiErrorResponse(e, 'broker lead permits GET', 'Не удалось загрузить разрешительные')
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  const auth = await requireBroker(req)
  if (!auth.ok) return auth.response

  const { id } = await params
  try {
    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Некорректный JSON в теле запроса' }, { status: 400 })
    }
    const parsed = CreatePermitSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Некорректные данные', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const lead = await db.lead.findUnique({ where: { id }, select: { order: { select: { id: true } } } })
    if (!lead) return NextResponse.json({ error: 'Запрос не найден' }, { status: 404 })

    const target = await resolveLeadDealTarget(id)
    if (!target) return NextResponse.json({ error: 'Запрос не найден' }, { status: 404 })

    const permit = await db.$transaction(async (tx) =>
      createPermit(target, brokerActor(auth.broker), parsed.data, tx)
    )
    return NextResponse.json({ permit }, { status: 201 })
  } catch (e) {
    return apiErrorResponse(e, 'broker lead permits POST', 'Не удалось добавить разрешительный')
  }
}
