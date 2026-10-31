import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireBroker } from '@/lib/broker-auth'
import { apiErrorResponse } from '@/lib/api-errors'
import { readPermits } from '@/lib/brokers'
import { ROUTE_COLUMN_SELECT } from '@/lib/route-fields'

// ─── GET /api/broker/orders — заявки, где я подключён (Д, роадмап 5а) ──
// «Видит заявку целиком с момента расчёта» — связь OrderBroker (перенос
// с лида при конвертации В4 или прямое подключение менеджера). Состав:
// номер, статус, анкета груза, инкотермс/ТН ВЭД (справочные условия,
// нужные именно таможенному представителю), ВСЕ этапы со статусами и
// датами (контекст цепочки — «не только свой этап», 5а), имя клиента,
// своя оценка (если связь идёт с лида). БЕЗ: исполнителей-подрядчиков
// (коммерческий периметр, решение И1 распространено на брокера),
// условий сделки и цен (quoteSnapshot), ленты и заметок, других
// брокеров, контактов клиента.
export async function GET(req: NextRequest) {
  const auth = await requireBroker(req)
  if (!auth.ok) return auth.response

  try {
    // Имя этапа — живой lookup по каталогу (паттерн Г4): stageCode —
    // служебный код, человеку нужно название.
    const catalog = await db.orderStageCatalog.findMany({ select: { code: true, name: true } })
    const nameByCode = new Map(catalog.map((c) => [c.code, c.name]))

    const orders = await db.order.findMany({
      where: { brokers: { some: { brokerId: auth.broker.id } } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        number: true,
        status: true,
        createdAt: true,
        cargoInfo: true,
        // DF-23 (б): маршрут/метрики — строка маршрута в списке из
        // колонок (легаси-ключи from/to из cargoInfo больше не пишутся)
        ...ROUTE_COLUMN_SELECT,
        incoterm: true,
        hsCode: true,
        customer: { select: { name: true } },
        // Оценка живёт на связи с лидом (5а: переживает конвертацию) —
        // тянем через заказ-источник только СВОЮ связь
        lead: {
          select: {
            id: true,
            brokers: {
              where: { brokerId: auth.broker.id },
              select: {
                estimate: {
                  select: {
                    customsDutyEstimate: true,
                    requiredPermits: true,
                    notes: true,
                    updatedAt: true,
                  },
                },
              },
            },
          },
        },
        stages: {
          orderBy: { sequence: 'asc' },
          select: {
            id: true,
            stageCode: true,
            sequence: true,
            status: true,
            plannedDate: true,
            actualDate: true,
          },
        },
      },
    })

    return NextResponse.json({
      orders: orders.map((o) => {
        // Моя связь с лидом-источником (если есть — оценка доступна
        // и правится; прямая связь без лида — leadId не отдаём, писать
        // оценку некуда, вводить портал в заблуждение нельзя)
        const myLink = o.lead?.brokers[0] ?? null
        return {
          id: o.id,
          number: o.number,
          status: o.status,
          createdAt: o.createdAt,
          cargoInfo: o.cargoInfo,
          // DF-23 (б): маршрут/метрики — строка маршрута списка из колонок
          originCity: o.originCity,
          originCountry: o.originCountry,
          destinationCity: o.destinationCity,
          destinationCountry: o.destinationCountry,
          transportType: o.transportType,
          readyDate: o.readyDate,
          weightKg: o.weightKg,
          volumeM3: o.volumeM3,
          placesCount: o.placesCount,
          incoterm: o.incoterm,
          hsCode: o.hsCode,
          customerName: o.customer?.name ?? null,
          leadId: myLink ? o.lead!.id : null,
          estimate: myLink?.estimate
            ? {
                customsDutyEstimate: myLink.estimate.customsDutyEstimate,
                requiredPermits: readPermits(myLink.estimate.requiredPermits),
                notes: myLink.estimate.notes,
                updatedAt: myLink.estimate.updatedAt,
              }
            : null,
          stages: o.stages.map((s) => ({
            id: s.id,
            name: nameByCode.get(s.stageCode) ?? s.stageCode,
            sequence: s.sequence,
            status: s.status,
            plannedDate: s.plannedDate,
            actualDate: s.actualDate,
          })),
        }
      }),
    })
  } catch (e) {
    return apiErrorResponse(e, 'broker/orders GET', 'Не удалось загрузить заявки')
  }
}
