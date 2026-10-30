import { Prisma } from '@prisma/client'
import { computeWaitingLead, computeWaitingOrder, type WaitingOutcome } from '@/lib/waiting'

// ─── DF-05: пересчёт ожидания в транзакции сделки ────────────────────
// Единственная точка ЗАПИСИ колонок waitingOn* (роуты их не трогают).
// Вызывается из emitEvent (lib/events.ts) в той же транзакции, что и
// изменение данных: сбой пересчёта откатывает операцию целиком —
// устаревший «мяч» на сделке так же недопустим, как потерянное событие.
//
// waitingSince сдвигается ТОЛЬКО при смене kind/reason (карточка DF-05),
// поэтому события, не меняющие состояние ожидания (заметка, правка
// груза), не трогают ни waitingSince, ни updatedAt — «заявка без
// движения» (Ж5) считается честно. Смена waitingOnId при том же
// kind/reason обновляет id, но не waitingSince.

// Начало текущего UTC-дня — та же семантика «сегодня», что на экране
// «Требует внимания» (Ж5): план на сегодня — не просрочка.
function todayUtcStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
}

// Итог = текущее значение? kind и reason — ключ смены waitingSince.
function sameOutcome(a: WaitingOutcome, kind: string | null, reason: string | null): boolean {
  return a.kind === (kind ?? '') && (a.reason ?? null) === reason
}

function outcomeToData(o: WaitingOutcome): Prisma.OrderUpdateInput | Prisma.LeadUpdateInput {
  return {
    waitingOnKind: o.kind,
    waitingOnId: o.onId,
    waitingReason: o.reason,
    // kind 'none' — ожидания нет: since обнуляется (иначе «Ждут дольше
    // N часов» считал бы завершённые сделки вечно). Смена kind/reason
    // здесь гарантирована (совпадение отсечено выше) — since = now.
    waitingSince: o.kind === 'none' ? null : new Date(),
  }
}

export async function recomputeWaitingOrder(
  tx: Prisma.TransactionClient,
  orderId: string,
  now: Date = new Date()
): Promise<void> {
  const order = await tx.order.findUnique({
    where: { id: orderId },
    select: {
      status: true,
      customerId: true,
      assignedToId: true,
      waitingOnKind: true,
      waitingReason: true,
      waitingOnId: true,
      stages: { select: { sequence: true, status: true, contractorId: true, plannedDate: true } },
      // Оценки платежей живут на связях лида (DF-02/5а): заявка видит
      // их через свой leadId. У ручной заявки (без лида) оценить
      // не из чего — брокеры без hasEstimate не приходят (правило 5
      // не применяется; решение в отчёте DF-05).
      brokers: { select: { brokerId: true } },
      lead: {
        select: {
          brokers: { select: { brokerId: true, estimate: { select: { id: true } } } },
        },
      },
    },
  })
  if (!order) return
  const estimateBrokers = new Set(
    (order.lead?.brokers ?? []).filter((b) => b.estimate).map((b) => b.brokerId)
  )
  const outcome = computeWaitingOrder(
    {
      status: order.status,
      customerId: order.customerId,
      assignedToId: order.assignedToId,
      stages: [...order.stages].sort((a, b) => a.sequence - b.sequence),
      brokers: order.brokers.map((b) => ({ brokerId: b.brokerId, hasEstimate: estimateBrokers.has(b.brokerId) })),
    },
    todayUtcStart(now)
  )
  if (sameOutcome(outcome, order.waitingOnKind, order.waitingReason)) {
    // Сменился только держатель (id) — обновить без сдвига waitingSince.
    if (outcome.onId !== (order.waitingOnId ?? null)) {
      await tx.order.update({ where: { id: orderId }, data: { waitingOnId: outcome.onId } })
    }
    return
  }
  await tx.order.update({
    where: { id: orderId },
    data: outcomeToData(outcome) as Prisma.OrderUpdateInput,
  })
}

export async function recomputeWaitingLead(
  tx: Prisma.TransactionClient,
  leadId: string
): Promise<void> {
  // Правила запроса (кроме D45-эскалации, она живёт в UI-слое) не
  // зависят от «сегодня» (нет плановых дат) — параметр now не нужен,
  // в отличие от recomputeWaitingOrder.
  const lead = await tx.lead.findUnique({
    where: { id: leadId },
    select: {
      status: true,
      customerId: true,
      cargoInfo: true,
      waitingOnKind: true,
      waitingReason: true,
      waitingOnId: true,
      brokers: { select: { brokerId: true, estimate: { select: { id: true } } } },
      _count: { select: { options: true, documents: true } },
      // D45: есть ли выбранный вариант (инвариант «ровно один» держит
      // API В3; здесь достаточно факта наличия).
      options: { where: { isSelected: true }, select: { id: true }, take: 1 },
      documents: {
        where: { type: 'invoice' },
        select: { id: true },
        take: 1,
      },
    },
  })
  if (!lead) return
  const cargo =
    lead.cargoInfo && typeof lead.cargoInfo === 'object' && !Array.isArray(lead.cargoInfo)
      ? (lead.cargoInfo as Record<string, unknown>)
      : {}
  const cargoName = typeof cargo.cargoName === 'string' ? cargo.cargoName.trim() : ''
  const outcome = computeWaitingLead({
    status: lead.status,
    customerId: lead.customerId,
    cargoName: cargoName || null,
    hasInvoiceDoc: lead.documents.length > 0,
    brokers: lead.brokers.map((b) => ({ brokerId: b.brokerId, hasEstimate: !!b.estimate })),
    optionsCount: lead._count.options,
    hasSelectedOption: lead.options.length > 0,
  })
  if (sameOutcome(outcome, lead.waitingOnKind, lead.waitingReason)) {
    if (outcome.onId !== (lead.waitingOnId ?? null)) {
      await tx.lead.update({ where: { id: leadId }, data: { waitingOnId: outcome.onId } })
    }
    return
  }
  await tx.lead.update({
    where: { id: leadId },
    data: outcomeToData(outcome) as Prisma.LeadUpdateInput,
  })
}

// Пересчёт по цели события (вызывается из emitEvent). Событие ЛИДА
// дополнительно пересчитывает его ЗАЯВКУ (если она есть): оценка
// платежей живёт на связи лида (LeadBroker → BrokerEstimate), поэтому
// события оценки/брокеров лида меняют правило 5 заявки, хотя таргетят
// лид (найдено на прогоне e2e: после PUT оценки заявка оставалась
// «ждёт брокера»). Обратное неверно: правила запроса от заявки
// не зависят — события заявки лид не трогают.
export async function recomputeAfterEvent(
  tx: Prisma.TransactionClient,
  target: { orderId: string } | { leadId: string },
  now: Date = new Date()
): Promise<void> {
  if ('orderId' in target) {
    await recomputeWaitingOrder(tx, target.orderId, now)
    return
  }
  await recomputeWaitingLead(tx, target.leadId)
  const linked = await tx.lead.findUnique({
    where: { id: target.leadId },
    select: { order: { select: { id: true } } },
  })
  if (linked?.order) {
    await recomputeWaitingOrder(tx, linked.order.id, now)
  }
}
