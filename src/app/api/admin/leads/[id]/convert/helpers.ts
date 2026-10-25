import { db } from '@/lib/db'
import {
  ACTIVITY_PUBLIC_FIELDS,
  ACTIVITY_FEED_TAKE,
} from '@/lib/activity'

// v0.5.0 (P1-22): хелперы конвертации лида в заявку (В4) — выезд из
// route.ts (резка под лимит 300, RULES 2.14). Логика 1:1.

// Д (роадмап 5а): перенос брокеров расчёта в заявку. Идемпотентен —
// существующие связи не дублирует (@unique orderId+brokerId и без
// того поймал бы, но проверка дешевле ретрая). Вызывается из обоих
// путей роута: основного и самозавершения краш-окна (заявка создана,
// статус не дописан) — чтобы краш между созданием заявки и переносом
// не лишал брокеров видимости навсегда.
export async function carryBrokersToOrder(
  leadId: string,
  orderId: string
): Promise<number> {
  const leadBrokers = await db.leadBroker.findMany({
    where: { leadId },
    select: { brokerId: true },
  })
  if (leadBrokers.length === 0) return 0

  const existing = await db.orderBroker.findMany({
    where: { orderId },
    select: { brokerId: true },
  })
  const existingIds = new Set(existing.map((b) => b.brokerId))
  // createMany + skipDuplicates — не для SQLite (не поддерживается),
  // поэтому фильтруем сами
  const toCreate = leadBrokers.filter((b) => !existingIds.has(b.brokerId))
  if (toCreate.length === 0) return 0

  await db.orderBroker.createMany({
    data: toCreate.map((b) => ({ orderId, brokerId: b.brokerId })),
  })
  return toCreate.length
}

// Свежая карточка лида для ответа (В5 не нужен повторный GET).
// Ж2: включает ленту событий — ответ конвертации обновляет состояние
// LeadCard целиком, без ленты карточка «теряла» бы её до перезагрузки.
// Д: брокеры с оценками — карточка лида показывает их и после won.
export async function loadLeadCard(id: string) {
  return db.lead.findUnique({
    where: { id },
    include: {
      customer: { select: { id: true, name: true, phone: true, email: true } },
      assignee: { select: { id: true, name: true } },
      options: { orderBy: { createdAt: 'asc' } },
      order: { select: { id: true, number: true, status: true } },
      brokers: {
        orderBy: { createdAt: 'asc' },
        include: {
          broker: { select: { id: true, companyName: true, phone: true, isActive: true, isInHouse: true } },
          estimate: true,
        },
      },
      activities: {
        orderBy: { createdAt: 'desc' },
        take: ACTIVITY_FEED_TAKE,
        select: ACTIVITY_PUBLIC_FIELDS,
      },
    },
  })
}
