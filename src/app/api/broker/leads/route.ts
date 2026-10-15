import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireBroker } from '@/lib/broker-auth'
import { apiErrorResponse } from '@/lib/api-errors'
import { readPermits } from '@/lib/brokers'

// ─── GET /api/broker/leads — запросы в расчёте, где я консультирую (Д) ──
// «Видит всё с этапа расчёта» (роадмап 5а): только СВОИ лиды (по связи
// LeadBroker), только БЕЗ заявки — сконвертированные сделки переезжают
// в список заявок (та же видимость через OrderBroker), дублировать
// сделку в двух списках портала путает.
//
// Состав — урезанный, по решению вопроса №1 (14.10.2026, то же семейство
// правил, что у клиентского кабинета И1): анкета груза (для оценки
// платежей она и нужна), статус воронки, имя клиента — и БЕЗ:
// вариантов расчёта и цен (коммерческие данные менеджера), контактов
// клиента (телефон/email — менеджер посредник), других брокеров
// сделки, ленты событий (внутренние заметки Ж3).
export async function GET(req: NextRequest) {
  const auth = await requireBroker(req)
  if (!auth.ok) return auth.response

  try {
    const links = await db.leadBroker.findMany({
      where: { brokerId: auth.broker.id, lead: { order: null } },
      orderBy: { createdAt: 'desc' },
      select: {
        createdAt: true,
        lead: {
          select: {
            id: true,
            status: true,
            createdAt: true,
            cargoInfo: true,
            customer: { select: { name: true } },
          },
        },
        estimate: {
          select: {
            customsDutyEstimate: true,
            requiredPermits: true,
            notes: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    })

    return NextResponse.json({
      leads: links.map((l) => ({
        id: l.lead.id,
        status: l.lead.status,
        createdAt: l.lead.createdAt,
        cargoInfo: l.lead.cargoInfo,
        customerName: l.lead.customer?.name ?? null,
        connectedAt: l.createdAt,
        estimate: l.estimate
          ? {
              customsDutyEstimate: l.estimate.customsDutyEstimate,
              requiredPermits: readPermits(l.estimate.requiredPermits),
              notes: l.estimate.notes,
              updatedAt: l.estimate.updatedAt,
            }
          : null,
      })),
    })
  } catch (e) {
    return apiErrorResponse(e, 'broker/leads GET', 'Не удалось загрузить запросы')
  }
}
