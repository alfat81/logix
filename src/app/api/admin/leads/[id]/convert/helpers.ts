import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import {
  ACTIVITY_PUBLIC_FIELDS,
  ACTIVITY_FEED_TAKE,
} from '@/lib/activity'
import { eventWhereFor } from '@/lib/audience'

// v0.5.0 (P1-22): хелперы конвертации лида в заявку (В4) — выезд из
// route.ts (резка под лимит 300, RULES 2.14). Логика 1:1.

// Д (роадмап 5а): перенос брокеров расчёта в заявку. Идемпотентен —
// существующие связи не дублирует (@unique orderId+brokerId и без
// того поймал бы, но проверка дешевле ретрая).
// DF-00: принимает tx для атомарной конвертации в единой транзакции.
export async function carryBrokersToOrder(
  leadId: string,
  orderId: string,
  tx?: Prisma.TransactionClient
): Promise<number> {
  const client = tx ?? db
  const leadBrokers = await client.leadBroker.findMany({
    where: { leadId },
    select: { brokerId: true },
  })
  if (leadBrokers.length === 0) return 0

  const existing = await client.orderBroker.findMany({
    where: { orderId },
    select: { brokerId: true },
  })
  const existingIds = new Set(existing.map((b) => b.brokerId))
  const toCreate = leadBrokers.filter((b) => !existingIds.has(b.brokerId))
  if (toCreate.length === 0) return 0

  await client.orderBroker.createMany({
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
        // DF-01: фильтр аудитории — только через eventWhereFor (§1.3);
        // для staff это пустой фрагмент.
        where: eventWhereFor('staff'),
        orderBy: { createdAt: 'desc' },
        take: ACTIVITY_FEED_TAKE,
        select: ACTIVITY_PUBLIC_FIELDS,
      },
    },
  })
}
