import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireEmployee } from '@/lib/auth'
import { apiErrorResponse } from '@/lib/api-errors'
import { logActivity, employeeActor } from '@/lib/activity'
import { BROKER_PUBLIC_FIELDS } from '@/lib/brokers'

type Params = { params: Promise<{ id: string }> }

// ─── POST /api/admin/orders/[id]/brokers — подключить брокера (Д) ──
// Видимость заявки целиком для брокера (роадмап 5а — не per-stage).
// Рождается двумя путями: переносом с лида при конвертации (В4) или
// вот этим прямым подключением — для ручных заявок (без лида, Б3) и
// подключения нового брокера после конвертации (оценку при этом
// сообщать некуда: BrokerEstimate живёт на связи с лидом, у прямой
// связи с заявкой оценки нет — расчёт уже прошёл).
//
// Статус заявки не ограничивает: подключение к исполнению/завершённой
// сделке — решение менеджера (брокер видит статус и этапы).
const AttachOrderBrokerSchema = z.object({
  brokerId: z.string().min(1, 'Выберите брокера'),
})

export async function POST(req: NextRequest, { params }: Params) {
  const auth = await requireEmployee(req, { write: true })
  if (!auth.ok) return auth.response

  const { id } = await params
  try {
    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Некорректный JSON в теле запроса' }, { status: 400 })
    }
    const parsed = AttachOrderBrokerSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Некорректные данные', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const order = await db.order.findUnique({
      where: { id },
      select: { id: true, number: true },
    })
    if (!order) {
      return NextResponse.json({ error: 'Заявка не найдена' }, { status: 404 })
    }

    const broker = await db.broker.findUnique({
      where: { id: parsed.data.brokerId },
      select: { ...BROKER_PUBLIC_FIELDS },
    })
    if (!broker) {
      return NextResponse.json({ error: 'Брокер не найден' }, { status: 404 })
    }
    if (!broker.isActive) {
      return NextResponse.json(
        { error: `Брокер «${broker.companyName}» деактивирован — новые подключения закрыты` },
        { status: 409 }
      )
    }

    const duplicate = await db.orderBroker.findUnique({
      where: { orderId_brokerId: { orderId: id, brokerId: broker.id } },
      select: { id: true },
    })
    if (duplicate) {
      return NextResponse.json(
        { error: `Брокер «${broker.companyName}» уже подключён к заявке №${order.number}` },
        { status: 409 }
      )
    }

    const link = await db.orderBroker.create({
      data: { orderId: id, brokerId: broker.id },
      include: { broker: { select: BROKER_PUBLIC_FIELDS } },
    })

    await logActivity(
      { orderId: id },
      employeeActor(auth.employee),
      'order_broker_attached',
      `Подключён брокер: ${broker.companyName}`,
    )

    return NextResponse.json({ link }, { status: 201 })
  } catch (e) {
    return apiErrorResponse(e, 'order brokers POST', 'Не удалось подключить брокера')
  }
}
