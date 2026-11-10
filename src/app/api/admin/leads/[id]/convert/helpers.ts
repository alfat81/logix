import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { RawContactSchema } from '@/lib/leads'
import { normalizePhone } from '@/lib/phone'
import {
  ACTIVITY_PUBLIC_FIELDS,
  ACTIVITY_FEED_TAKE,
} from '@/lib/activity'
import { eventWhereFor } from '@/lib/audience'
import { projectActors, STAFF_READER } from '@/lib/actor-name'

// v0.5.0 (P1-22): хелперы конвертации лида в заявку (В4) — выезд из
// route.ts (резка под лимит 300, RULES 2.14). Логика 1:1.

// AUD-01 (поток A волна 1): блокировочное чтение лида для ЛЮБОЙ операции
// с вариантами — первым шагом транзакции `SELECT … FOR UPDATE`, затем
// перечитывание и валидация. Закрывает окно TOCTOU «вариант ↔ конвертация»
// (аудит v0.8.5, сценарий 6.2): раньше лид проверялся ДО транзакции без
// блокировки, и вариант с isSelected:true мог родиться уже на won-лиде.
// Дедлок невозможен: операции с вариантами блокируют только строку Lead;
// convert блокирует Lead → Contract (одинаковый порядок, цикла нет).
// Гард client_approved (уровень 1 защиты, план §1 п. 8): правка вариантов
// при активном согласовании запрещена — сначала «Изменить условия».
export async function lockLeadForOptions(
  tx: Prisma.TransactionClient,
  leadId: string
): Promise<
  | { ok: true; lead: { id: string; status: string } }
  | { ok: false; status: number; error: string }
> {
  await tx.$queryRaw`SELECT id FROM "Lead" WHERE id = ${leadId} FOR UPDATE`
  const lead = await tx.lead.findUnique({
    where: { id: leadId },
    include: { order: { select: { id: true, number: true } } },
  })
  if (!lead) return { ok: false, status: 404, error: 'Запрос не найден' }
  if (lead.order || lead.status === 'won') {
    return {
      ok: false,
      status: 409,
      error: 'Запрос конвертирован в заявку — варианты расчёта зафиксированы',
    }
  }
  if (lead.status === 'client_approved') {
    return {
      ok: false,
      status: 409,
      error: 'Согласование активно — сначала сбросьте его действием «Изменить условия»',
    }
  }
  return { ok: true, lead: { id: lead.id, status: lead.status } }
}

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
// DF-02A (Блок 4): актёр-человек собирается при чтении (staff —
// «Имя (Компания)»), вызов после транзакции — db, не tx.
export async function loadLeadCard(id: string) {
  const lead = await db.lead.findUnique({
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
  if (!lead) return lead
  const activities = await projectActors(lead.activities, STAFF_READER)
  return { ...lead, activities }
}

// ─── Поток A волна 1 (BL-5): сборка снимка заявки (integrity IC-09 —
// вынесено из convert/route.ts, RULES 2.14) ──────────────────────────
// Клиентская часть снимка — ИЗ АКТИВНОГО СНИМКА СОГЛАСОВАНИЯ
// (LeadApprovalSnapshot): ровно то, с чем согласился клиент, защита
// по построению (план ред. 3 §4.3 п. 3). Себестоимость — из варианта
// на момент конвертации (внутренние данные, снимком согласования не
// покрываются); пишется только при заданной себестоимости.
export type ApprovalSnapshotLike = {
  description: string
  transportModes: unknown
  price: Prisma.Decimal
  currency: string
  vatMode: string
  etaDays: number
  priorityFit: string
}

export function buildOrderQuoteSnapshot(
  approval: ApprovalSnapshotLike,
  selectedCost: { costEstimate: number; costCurrency: string } | null
): Prisma.InputJsonObject {
  return {
    description: approval.description,
    price: approval.price.toNumber(),
    currency: approval.currency,
    vatMode: approval.vatMode,
    etaDays: approval.etaDays,
    priorityFit: approval.priorityFit,
    ...(Array.isArray(approval.transportModes)
      ? { transportModes: approval.transportModes.filter((m) => typeof m === 'string') }
      : {}),
    ...(selectedCost ?? {}),
  }
}

// Себестоимость выбранного варианта на момент конвертации (null — не задана)
export function resolveSelectedCost(selected: {
  costEstimate: Prisma.Decimal | null
  costCurrency: string
}): { costEstimate: number; costCurrency: string } | null {
  return selected.costEstimate != null
    ? { costEstimate: selected.costEstimate.toNumber(), costCurrency: selected.costCurrency }
    : null
}

// DF-23 (в): ТН ВЭД — одна точка правки (вынесено из convert/route.ts,
// RULES 2.14): бланк анкеты (cargoInfo с заблокированной строки лида) —
// источник правды, колонка hsCode следует за ним. Код в теле (диалог,
// предзаполнен бланком) — правка кода В снимке бланка заявки; пусто в
// теле → колонка из бланка (прямой API-вызов молча не теряет код
// анкеты), явный null → код снимается с бланка заявки.
export function buildCargoSnapshot(
  leadBlank: Prisma.InputJsonObject | null,
  hsCodeFromBody: string | null | undefined
): { effectiveHsCode: string | null; cargoSnapshot: Prisma.InputJsonObject | undefined } {
  const blankHs = (() => {
    const v = (leadBlank as Record<string, unknown> | null)?.hsCode
    return typeof v === 'string' && v.trim() ? v.trim() : null
  })()
  const effectiveHsCode = hsCodeFromBody !== undefined ? (hsCodeFromBody || null) : blankHs
  const cargoSnapshot: Prisma.InputJsonObject | undefined = leadBlank
    ? hsCodeFromBody !== undefined
      ? { ...leadBlank, hsCode: effectiveHsCode }
      : leadBlank
    : effectiveHsCode
      ? { v: 1, hsCode: effectiveHsCode }
      : undefined
  return { effectiveHsCode, cargoSnapshot }
}

// Контакты для заведения клиента при отсутствии customerId (В4; вынесено
// из convert/route.ts, RULES 2.14): анкета лида нормализуется — телефон
// может быть иностранным, normalizePhone один раз при рождении Customer.
// 'invalid' — анкета без корректных контактов (роут отвечает 400).
export function parseRawContactForCustomer(
  rawContact: Prisma.JsonValue | null
): { name: string; phone: string | null; email: string | null } | 'invalid' {
  const raw = RawContactSchema.safeParse(rawContact)
  if (!raw.success || !raw.data) return 'invalid'
  return {
    name: raw.data.name,
    phone: raw.data.phone ? (normalizePhone(raw.data.phone) ?? raw.data.phone.trim()) : null,
    email: raw.data.email ?? null,
  }
}
