import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireBroker } from '@/lib/broker-auth'
import { apiErrorResponse } from '@/lib/api-errors'
import { readPermits } from '@/lib/brokers'
import { PERMIT_EXTERNAL_FIELDS } from '@/lib/permits-db'
import { ROUTE_COLUMN_SELECT } from '@/lib/route-fields'

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
            // DF-23 (б): маршрут/метрики — без веса/объёма/маршрута
            // брокер не оценивает платежи (DF-18); терялись в проекции
            ...ROUTE_COLUMN_SELECT,
            customer: { select: { name: true } },
            order: { select: { id: true, number: true } },
            // DF-16: разрешительные сделки — брокеру наружная проекция
            // (цель — заявка после конвертации, иначе запрос).
            permitRequirements: {
              orderBy: [{ isBlocking: 'desc' }, { createdAt: 'asc' } as const],
              select: PERMIT_EXTERNAL_FIELDS,
            },
          },
        },
        estimate: { include: { items: { orderBy: { sortOrder: 'asc' } } } },
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
        // DF-23 (б): маршрут/метрики — для оценки платежей (DF-18)
        originCity: link.lead.originCity,
        originCountry: link.lead.originCountry,
        destinationCity: link.lead.destinationCity,
        destinationCountry: link.lead.destinationCountry,
        transportType: link.lead.transportType,
        readyDate: link.lead.readyDate,
        weightKg: link.lead.weightKg,
        volumeM3: link.lead.volumeM3,
        placesCount: link.lead.placesCount,
        customerName: link.lead.customer?.name ?? null,
        order: link.lead.order,
        connectedAt: link.createdAt,
        // DF-16: строки разрешительных (цель — заявка после конвертации
        // или сам запрос), наружная проекция без staffNote.
        permits: link.lead.permitRequirements,
        estimate: link.estimate
          ? {
              customsDutyEstimate: link.estimate.customsDutyEstimate,
              requiredPermits: readPermits(link.estimate.requiredPermits),
              notes: link.estimate.notes,
              // DF-18: статус и строки ответа — форма предзаполняется,
              // брокер видит, отправлен ответ или черновик.
              status: link.estimate.status,
              sentAt: link.estimate.sentAt,
              items: link.estimate.items.map((i) => ({
                hsCode: i.hsCode,
                isManualCode: i.isManualCode,
                dutyPercent: i.dutyPercent,
                addDutyPercent: i.addDutyPercent,
                addDutyNote: i.addDutyNote,
                vatPercent: i.vatPercent,
                rateNote: i.rateNote,
                sortOrder: i.sortOrder,
              })),
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
