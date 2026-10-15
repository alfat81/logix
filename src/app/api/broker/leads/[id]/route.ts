import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireBroker } from '@/lib/broker-auth'
import { apiErrorResponse } from '@/lib/api-errors'
import { readPermits } from '@/lib/brokers'

type Params = { params: Promise<{ id: string }> }

// ─── GET /api/broker/leads/[id] — карточка расчёта для брокера (Д) ──
// Зеркало состава списка (тот же периметр видимости): полная анкета
// груза (бланк заявки — вес/объём/ТН ВЭД/отправитель/получатель, без
// неё платежи не посчитать), статус, имя клиента, своя оценка. Без
// вариантов и цен, контактов клиента, других брокеров и ленты.
// Чужой/неподключённый лид — 404, а не 403: факт существования чужой
// сделки не раскрываем (паттерн Г4/И1).
export async function GET(req: NextRequest, { params }: Params) {
  const auth = await requireBroker(req)
  if (!auth.ok) return auth.response

  const { id } = await params
  try {
    const link = await db.leadBroker.findUnique({
      where: { leadId_brokerId: { leadId: id, brokerId: auth.broker.id } },
      select: {
        createdAt: true,
        lead: {
          select: {
            id: true,
            status: true,
            createdAt: true,
            cargoInfo: true,
            customer: { select: { name: true } },
            order: { select: { id: true, number: true } },
          },
        },
        estimate: true,
      },
    })
    if (!link) {
      return NextResponse.json({ error: 'Запрос не найден' }, { status: 404 })
    }

    return NextResponse.json({
      lead: {
        id: link.lead.id,
        status: link.lead.status,
        createdAt: link.lead.createdAt,
        cargoInfo: link.lead.cargoInfo,
        customerName: link.lead.customer?.name ?? null,
        order: link.lead.order,
        connectedAt: link.createdAt,
        estimate: link.estimate
          ? {
              customsDutyEstimate: link.estimate.customsDutyEstimate,
              requiredPermits: readPermits(link.estimate.requiredPermits),
              notes: link.estimate.notes,
              createdAt: link.estimate.createdAt,
              updatedAt: link.estimate.updatedAt,
            }
          : null,
      },
    })
  } catch (e) {
    return apiErrorResponse(e, 'broker/lead GET', 'Не удалось загрузить запрос')
  }
}
