import { NextRequest, NextResponse } from 'next/server'
import { requireEmployee } from '@/lib/auth'
import { apiErrorResponse } from '@/lib/api-errors'
import { detachBrokerFromOrder } from '@/lib/broker-links'

type Params = { params: Promise<{ id: string; brokerId: string }> }

// ─── DELETE /api/admin/orders/[id]/brokers/[brokerId] — отключить (Д) ──
// Снимает видимость заявки у брокера. Связь LeadBroker-источник (если
// была — перенос при конвертации В4) НЕ трогается: лид — зафиксирован-
// ная история расчёта, у него свои правила (409 на won). Оценка
// таможенных платежей живёт на связи лида и после отключения от
// заявки остаётся в истории расчёта — менеджер продолжает её видеть
// на карточке лида. Снятие связи, номер заявки для ответа и событие
// detach — в lib/broker-links.ts (общий хвост с запросом, DF-01 G3).
export async function DELETE(req: NextRequest, { params }: Params) {
  const auth = await requireEmployee(req, { write: true })
  if (!auth.ok) return auth.response

  const { id, brokerId } = await params
  try {
    const detached = await detachBrokerFromOrder(id, brokerId, auth.employee)
    if (!detached) {
      return NextResponse.json({ error: 'Брокер не подключён к этой заявке' }, { status: 404 })
    }

    return NextResponse.json({
      ok: true,
      message: `Брокер «${detached.snapshot.broker.companyName}» отключён от заявки №${detached.orderNumber}`,
    })
  } catch (e) {
    return apiErrorResponse(e, 'order brokers DELETE', 'Не удалось отключить брокера')
  }
}
