import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireEmployee } from '@/lib/auth'
import { apiErrorResponse } from '@/lib/api-errors'
import { logActivity, employeeActor } from '@/lib/activity'

type Params = { params: Promise<{ id: string; brokerId: string }> }

// ─── DELETE /api/admin/orders/[id]/brokers/[brokerId] — отключить (Д) ──
// Снимает видимость заявки у брокера. Связь LeadBroker-источник (если
// была — перенос при конвертации В4) НЕ трогается: лид — зафиксирован-
// ная история расчёта, у него свои правила (409 на won). Оценка
// таможенных платежей живёт на связи лида и после отключения от
// заявки остаётся в истории расчёта — менеджер продолжает её видеть
// на карточке лида.
export async function DELETE(req: NextRequest, { params }: Params) {
  const auth = await requireEmployee(req, { write: true })
  if (!auth.ok) return auth.response

  const { id, brokerId } = await params
  try {
    const order = await db.order.findUnique({
      where: { id },
      select: { number: true },
    })
    if (!order) {
      return NextResponse.json({ error: 'Заявка не найдена' }, { status: 404 })
    }

    const link = await db.orderBroker.findUnique({
      where: { orderId_brokerId: { orderId: id, brokerId } },
      include: { broker: { select: { id: true, companyName: true } } },
    })
    if (!link) {
      return NextResponse.json({ error: 'Брокер не подключён к этой заявке' }, { status: 404 })
    }

    await db.orderBroker.delete({ where: { id: link.id } })

    await logActivity(
      { orderId: id },
      employeeActor(auth.employee),
      'order_broker_detached',
      `Отключён брокер: ${link.broker.companyName}`,
    )

    return NextResponse.json({
      ok: true,
      message: `Брокер «${link.broker.companyName}» отключён от заявки №${order.number}`,
    })
  } catch (e) {
    return apiErrorResponse(e, 'order brokers DELETE', 'Не удалось отключить брокера')
  }
}
