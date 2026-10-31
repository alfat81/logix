import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireBroker } from '@/lib/broker-auth'
import { apiErrorResponse } from '@/lib/api-errors'
import { readPermits } from '@/lib/brokers'
import { PERMIT_EXTERNAL_FIELDS } from '@/lib/permits-db'
import { ROUTE_COLUMN_SELECT } from '@/lib/route-fields'

type Params = { params: Promise<{ id: string }> }

// ─── GET /api/broker/orders/[id] — карточка заявки брокера (Д) ─────
// Состав — зеркало списка (периметр один): заявка целиком = анкета,
// справочные поля (инкотерм/ТН ВЭД/профиль груза), ВСЕ этапы со
// статусами и датами (полная цепочка, «не только свой этап» — 5а),
// имя клиента, своя оценка. Без подрядчиков, цен, заметок, чужих
// брокеров и контактов клиента. Чужая заявка — 404, не 403 (Г4/И1).
export async function GET(req: NextRequest, { params }: Params) {
  const auth = await requireBroker(req)
  if (!auth.ok) return auth.response

  const { id } = await params
  try {
    const order = await db.order.findFirst({
      where: { id, brokers: { some: { brokerId: auth.broker.id } } },
      select: {
        id: true,
        number: true,
        status: true,
        createdAt: true,
        cargoInfo: true,
        // DF-23 (б): маршрут/метрики — брокеру они нужны для оценки
        // платежей (DF-18); терялись в этой проекции
        ...ROUTE_COLUMN_SELECT,
        incoterm: true,
        incotermPlace: true,
        hsCode: true,
        cargoProfile: true,
        customer: { select: { name: true } },
        // DF-16: разрешительные заявки — брокеру наружная проекция
        // (staffNote не покидает сервер).
        permitRequirements: {
          orderBy: [{ isBlocking: 'desc' }, { createdAt: 'asc' } as const],
          select: PERMIT_EXTERNAL_FIELDS,
        },
        lead: {
          select: {
            id: true,
            brokers: {
              where: { brokerId: auth.broker.id },
              select: {
                estimate: { include: { items: { orderBy: { sortOrder: 'asc' } } } },
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
    if (!order) {
      return NextResponse.json({ error: 'Заявка не найдена' }, { status: 404 })
    }

    const catalog = await db.orderStageCatalog.findMany({ select: { code: true, name: true } })
    const nameByCode = new Map(catalog.map((c) => [c.code, c.name]))

    const myLink = order.lead?.brokers[0] ?? null

    return NextResponse.json({
      order: {
        id: order.id,
        number: order.number,
        status: order.status,
        createdAt: order.createdAt,
        cargoInfo: order.cargoInfo,
        // DF-23 (б): маршрут/метрики — те же колонки, что в select выше
        originCity: order.originCity,
        originCountry: order.originCountry,
        destinationCity: order.destinationCity,
        destinationCountry: order.destinationCountry,
        transportType: order.transportType,
        readyDate: order.readyDate,
        weightKg: order.weightKg,
        volumeM3: order.volumeM3,
        placesCount: order.placesCount,
        incoterm: order.incoterm,
        incotermPlace: order.incotermPlace,
        hsCode: order.hsCode,
        cargoProfile: order.cargoProfile,
        customerName: order.customer?.name ?? null,
        // DF-16: строки разрешительных заявки.
        permits: order.permitRequirements,
        // leadId — только вместе с моей связью лида: у прямой связи
        // оценки не бывает (роадмап 5а — она живёт на LeadBroker),
        // отдача «чужого» leadId предлагала бы брокеру форму, чей PUT
        // закончится 404
        leadId: myLink ? order.lead!.id : null,
        estimate: myLink?.estimate
          ? {
              customsDutyEstimate: myLink.estimate.customsDutyEstimate,
              requiredPermits: readPermits(myLink.estimate.requiredPermits),
              notes: myLink.estimate.notes,
              // DF-18: статус и строки — форма на карточке заявки
              // предзаполняется так же, как на карточке расчёта.
              status: myLink.estimate.status,
              sentAt: myLink.estimate.sentAt,
              items: myLink.estimate.items.map((i) => ({
                hsCode: i.hsCode,
                isManualCode: i.isManualCode,
                dutyPercent: i.dutyPercent,
                addDutyPercent: i.addDutyPercent,
                addDutyNote: i.addDutyNote,
                vatPercent: i.vatPercent,
                rateNote: i.rateNote,
                sortOrder: i.sortOrder,
              })),
              createdAt: myLink.estimate.createdAt,
              updatedAt: myLink.estimate.updatedAt,
            }
          : null,
        stages: order.stages.map((s) => ({
          id: s.id,
          name: nameByCode.get(s.stageCode) ?? s.stageCode,
          sequence: s.sequence,
          status: s.status,
          plannedDate: s.plannedDate,
          actualDate: s.actualDate,
        })),
      },
    })
  } catch (e) {
    return apiErrorResponse(e, 'broker/order GET', 'Не удалось загрузить заявку')
  }
}
