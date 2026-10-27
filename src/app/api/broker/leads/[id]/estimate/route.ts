import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { requireBroker } from '@/lib/broker-auth'
import { apiErrorResponse } from '@/lib/api-errors'
import { brokerActor } from '@/lib/activity'
import { emitEvent } from '@/lib/events'
import { BrokerEstimateSchema, readPermits } from '@/lib/brokers'
import { formatMoney } from '@/lib/money'

type Params = { params: Promise<{ id: string }> }

// ─── PUT /api/broker/leads/[id]/estimate — оценка платежей (Д, 5а) ──
// Обязанность брокера с этапа расчёта: (а) ожидаемый размер таможенных
// платежей и (б) список разрешительных документов. Единственный write
// портала брокера — и только по СВОЕЙ связи с лидом (оценка чужой
// сделки невозможна, 404). Полная замена (семантика PATCH заявки Ж1):
// не переданные поля обнуляются, пустая вся форма = снять оценку.
//
// Доступна и ПОСЛЕ конвертации (won-лид): платежи уточняются после
// классификации товара уже в исполнении — брокер правит свою оценку с
// карточки заявки (портал знает leadId заявки), менеджер видит свежие
// цифры. Деактивированный брокер сюда не дойдёт — requireBroker.
export async function PUT(req: NextRequest, { params }: Params) {
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
    const parsed = BrokerEstimateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Некорректные данные', details: parsed.error.flatten() },
        { status: 400 }
      )
    }
    const data = parsed.data

    const link = await db.leadBroker.findUnique({
      where: { leadId_brokerId: { leadId: id, brokerId: auth.broker.id } },
      include: { estimate: { select: { id: true } } },
    })
    if (!link) {
      return NextResponse.json({ error: 'Запрос не найден' }, { status: 404 })
    }

    const estimateData = {
      customsDutyEstimate: data.customsDutyEstimate ?? null,
      // Полная замена: не передан/пусто → SQL NULL (Prisma.DbNull —
      // у nullable Json-колонок «очистить» это именно SQL NULL, Ж1)
      requiredPermits:
        data.requiredPermits !== undefined && data.requiredPermits !== null
          ? (data.requiredPermits as unknown as Prisma.InputJsonArray)
          : Prisma.DbNull,
      notes: data.notes ?? null,
    }

    const estimate = await db.brokerEstimate.upsert({
      where: { leadBrokerId: link.id },
      create: { leadBrokerId: link.id, ...estimateData },
      update: estimateData,
    })

    // Ж2: событие лида с актёром-брокером — менеджер видит в ленте,
    // что цифры пришли/обновились (и когда). Лента лида не видна
    // брокеру — isInternal тут не нужен: событие информационное.
    const duty = estimate.customsDutyEstimate
    const permits = readPermits(estimate.requiredPermits)
    const parts: string[] = []
    // P1-04: Decimal → строка → formatMoney (единственная точка
    // форматирования, RULES 2.15)
    parts.push(
      duty !== null ? `платежи: ${formatMoney(duty.toString(), 'RUB')}` : 'платежи: не указаны',
    )
    parts.push(permits.length > 0 ? `разрешительные документы: ${permits.length}` : 'разрешительные документы: не указаны')
    await emitEvent(db, {
      target: { leadId: id },
      actor: brokerActor({ id: auth.broker.id, companyName: auth.broker.companyName }),
      type: 'broker_estimate_changed',
      description: `Оценка таможенных платежей (${link.estimate ? 'обновлена' : 'сообщена'}) — ${parts.join(', ')}`,
    })

    return NextResponse.json({
      estimate: {
        customsDutyEstimate: estimate.customsDutyEstimate,
        requiredPermits: readPermits(estimate.requiredPermits),
        notes: estimate.notes,
        createdAt: estimate.createdAt,
        updatedAt: estimate.updatedAt,
      },
      message: link.estimate ? 'Оценка обновлена' : 'Оценка сообщена',
    })
  } catch (e) {
    return apiErrorResponse(e, 'broker/estimate PUT', 'Не удалось сохранить оценку')
  }
}
