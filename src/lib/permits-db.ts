import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { emitEvent } from '@/lib/events'
import { createDocumentOnDeal, type DocActor, type DocumentDealTarget } from '@/lib/documents'
import type { ActivityActor } from '@/lib/activity'
import {
  CreatePermitInput,
  PatchPermitInput,
  type PermitProvider,
  fmtPermitDate,
  PERMIT_PROVIDER_LABELS,
} from '@/lib/permits'

// ─── DF-16: серверное ядро разрешительных документов ─────────────────
// Единая точка записи PermitRequirement (роуты валидируют и зовут отсюда,
// как documents.ts для Дорожки Е). События — только через emitEvent
// (гард DF-01); перечень событий карточки DF-16 исчерпывающий:
// permit_added / permit_received / permit_waived / permit_overdue
// (скан диспетчера — notifications/permits-scan.ts). Правка полей строки
// сотрудником (PATCH без смены статуса) событий не пишет — карточка
// DF-16 их не предусматривает, факт виден по updatedAt строки.

// Полная проекция (staff; включает внутреннюю заметку строки).
export const PERMIT_FIELDS = {
  id: true,
  orderId: true,
  leadId: true,
  title: true,
  providedBy: true,
  isBlocking: true,
  neededBy: true,
  status: true,
  documentId: true,
  receivedAt: true,
  receivedByName: true,
  waivedReason: true,
  staffNote: true,
  itemId: true,
  source: true,
  createdByType: true,
  createdByName: true,
  lastRemindedAt: true,
  createdAt: true,
} as const

// Наружная проекция (клиент/брокер): внутренняя заметка и служебные
// source/lastRemindedAt не покидают сервер (видимость карточки DF-16).
export const PERMIT_EXTERNAL_FIELDS = {
  id: true,
  title: true,
  providedBy: true,
  isBlocking: true,
  neededBy: true,
  status: true,
  documentId: true,
  receivedAt: true,
  receivedByName: true,
  waivedReason: true,
  itemId: true,
  createdAt: true,
} as const

export type PermitRow = Prisma.PermitRequirementGetPayload<{ select: typeof PERMIT_FIELDS }>

function dealWhere(deal: DocumentDealTarget) {
  return 'orderId' in deal ? { orderId: deal.orderId } : { leadId: deal.leadId }
}

// Сделка строки: permit → цель-сделка (ровно одна).
export function permitTargetOf(permit: { orderId: string | null; leadId: string | null }): DocumentDealTarget {
  if (permit.orderId) return { orderId: permit.orderId }
  if (permit.leadId) return { leadId: permit.leadId }
  throw new Error('PermitRequirement без цели-сделки — нарушение инварианта')
}

function permitAddedDescription(input: {
  title: string
  providedBy: PermitProvider
  isBlocking: boolean
  neededBy: string | null
}): string {
  const who = PERMIT_PROVIDER_LABELS[input.providedBy]
  const due = input.neededBy ? `, срок ${fmtPermitDate(new Date(input.neededBy))}` : ''
  const blocks = input.isBlocking ? ' — блокирует отправку' : ''
  return `Разрешительный документ «${input.title}» — предоставить: ${who}${due}${blocks}`
}

// ─── Добавление строки (брокер или сотрудник) ────────────────────────
export async function createPermit(
  deal: DocumentDealTarget,
  actor: ActivityActor,
  input: CreatePermitInput,
  tx: Prisma.TransactionClient = db
): Promise<PermitRow> {
  const created = await tx.permitRequirement.create({
    data: {
      ...dealWhere(deal),
      title: input.title,
      providedBy: input.providedBy,
      isBlocking: input.isBlocking ?? false,
      neededBy: input.neededBy ? new Date(`${input.neededBy}T00:00:00.000Z`) : null,
      staffNote: input.staffNote ?? null,
      itemId: input.itemId ?? null,
      source: 'manual',
      createdByType: actor.type,
      createdById: actor.type === 'system' ? null : actor.id,
      createdByName: actor.type === 'system' ? 'Система' : actor.name,
    },
    select: PERMIT_FIELDS,
  })
  await emitEvent(tx, {
    target: deal,
    actor,
    type: 'permit_added',
    description: permitAddedDescription({
      title: created.title,
      providedBy: created.providedBy as PermitProvider,
      isBlocking: created.isBlocking,
      neededBy: created.neededBy ? created.neededBy.toISOString() : null,
    }),
  })
  return created
}

// ─── Правка строки (только сотрудник) ────────────────────────────────
// status='received' через PATCH запрещён (только загрузкой документа —
// контракту нужен файл); 'waived' — с причиной.
export async function patchPermit(
  permitId: string,
  input: PatchPermitInput,
  actor: ActivityActor,
  tx: Prisma.TransactionClient = db
): Promise<PermitRow | null> {
  const current = await tx.permitRequirement.findUnique({ where: { id: permitId }, select: PERMIT_FIELDS })
  if (!current) return null

  if (input.status === 'received') {
    throw Object.assign(new Error('Разрешительный закрывается загрузкой документа, а не правкой строки'), { statusCode: 400 })
  }
  const waiving = input.status === 'waived' && current.status !== 'waived'
  if (waiving && !(input.waivedReason ?? '').trim()) {
    throw Object.assign(new Error('Укажите причину — почему документ не требуется'), { statusCode: 400 })
  }

  const updated = await tx.permitRequirement.update({
    where: { id: permitId },
    data: {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.providedBy !== undefined ? { providedBy: input.providedBy } : {}),
      ...(input.isBlocking !== undefined ? { isBlocking: input.isBlocking } : {}),
      ...(input.neededBy !== undefined
        ? { neededBy: input.neededBy ? new Date(`${input.neededBy}T00:00:00.000Z`) : null }
        : {}),
      ...(input.staffNote !== undefined ? { staffNote: input.staffNote } : {}),
      ...(input.itemId !== undefined ? { itemId: input.itemId } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.waivedReason !== undefined ? { waivedReason: input.waivedReason } : {}),
      // Правка полученной строки не трогает факт получения; снятие
      // «не требуется» возвращает строку в ожидание.
      ...(input.status === 'pending' && current.status !== 'pending'
        ? { documentId: null, receivedAt: null, receivedByName: null, waivedReason: null, lastRemindedAt: null }
        : {}),
    },
    select: PERMIT_FIELDS,
  })

  if (waiving) {
    // Причина (waivedReason) видна сотрудникам в строке; наружу уходит
    // нейтральный текст события — причина может быть внутренней кухней.
    await emitEvent(tx, {
      target: permitTargetOf(updated),
      actor,
      type: 'permit_waived',
      description: `Разрешительный документ «${updated.title}» отмечен не требуемым`,
    })
  }
  return updated
}

// ─── Закрытие строки загрузкой документа (клиент/брокер/сотрудник) ───
// Документ создаётся существующим контуром Е (createDocumentOnDeal,
// type='permit' — reюз, IC-14), затем строка получает статус received.
// Повторное закрытие полученной строки — 409 (правка документа — через
// версии обычного документа).
export async function closePermitWithDocument(
  permitId: string,
  actor: DocActor,
  meta: { title: string; comment?: string },
  file: { fileName: string; mimeType: string; fileSize: number; fileData: Uint8Array<ArrayBuffer> }
): Promise<{ permit: PermitRow; documentId: string } | { error: string; status: number }> {
  const permit = await db.permitRequirement.findUnique({ where: { id: permitId }, select: PERMIT_FIELDS })
  if (!permit) return { error: 'Разрешительный документ не найден', status: 404 }
  if (permit.status !== 'pending') {
    return { error: 'Строка уже закрыта — документ прикладывается версиями к загруженному', status: 409 }
  }
  const deal = permitTargetOf(permit)
  const document = await createDocumentOnDeal(deal, actor, {
    type: 'permit',
    title: meta.title,
    isInternal: false,
    comment: meta.comment,
  }, file)
  const updated = await db.permitRequirement.update({
    where: { id: permitId },
    data: {
      status: 'received',
      documentId: document.id,
      receivedAt: new Date(),
      receivedByName: actor.name,
      lastRemindedAt: null,
    },
    select: PERMIT_FIELDS,
  })
  await emitEvent(db, {
    target: deal,
    actor,
    type: 'permit_received',
    description: `Разрешительный документ «${updated.title}» получен (${actor.name})`,
    documentId: document.id,
  })
  return { permit: updated, documentId: document.id }
}

// ─── Перенос при конвертации В4 (лид → заявка) ───────────────────────
// Идемпотентен (updateMany с фильтром), как carryDocumentsToOrder.
export async function carryPermitsToOrder(
  leadId: string,
  orderId: string,
  tx?: Prisma.TransactionClient
): Promise<number> {
  const client = tx ?? db
  const res = await client.permitRequirement.updateMany({
    where: { leadId, orderId: null },
    data: { orderId, leadId: null },
  })
  return res.count
}

// ─── Sync свободного списка ответа брокера (PUT estimate) ────────────
// requiredPermits превращается в строки (карточка DF-16): добавленные
// названия создают pending-строки source='estimate' (событие permit_added
// одним списком — клиенту уходит письмо, расчёт — режим immediate);
// исчезнувшие из списка удаляют СВОИ pending-строки без документа
// (received/waived и строки из /permits не трогаются никогда).
// Цель — заявка, если лид уже конвертирован, иначе запрос.
export async function syncEstimatePermits(
  tx: Prisma.TransactionClient,
  leadId: string,
  titles: string[],
  actor: ActivityActor,
): Promise<{ added: string[]; removed: number }> {
  const lead = await tx.lead.findUnique({ where: { id: leadId }, select: { order: { select: { id: true } } } })
  if (!lead) return { added: [], removed: 0 }
  const deal: DocumentDealTarget = lead.order ? { orderId: lead.order.id } : { leadId }

  const clean = [...new Set(titles.map((t) => t.trim()).filter(Boolean))]
  const existing = await tx.permitRequirement.findMany({
    where: dealWhere(deal),
    select: { id: true, title: true, source: true, status: true, documentId: true },
  })
  const norm = (s: string) => s.trim().toLowerCase()
  const existingTitles = new Set(existing.map((r) => norm(r.title)))

  const added = clean.filter((t) => !existingTitles.has(norm(t)))
  if (added.length > 0) {
    await tx.permitRequirement.createMany({
      data: added.map((title) => ({
        ...dealWhere(deal),
        title,
        providedBy: 'client',
        isBlocking: false,
        status: 'pending',
        source: 'estimate',
        createdByType: actor.type,
        createdById: actor.type === 'system' ? null : actor.id,
        createdByName: actor.type === 'system' ? 'Система' : actor.name,
      })),
    })
    await emitEvent(tx, {
      target: deal,
      actor,
      type: 'permit_added',
      description: `Разрешительные документы из ответа брокера: ${added.map((t) => `«${t}»`).join(', ')} — предоставить: клиент`,
    })
  }

  const keep = new Set(clean.map(norm))
  const removable = existing.filter(
    (r) =>
      r.source === 'estimate' &&
      r.status === 'pending' &&
      r.documentId === null &&
      !keep.has(norm(r.title))
  )
  if (removable.length > 0) {
    await tx.permitRequirement.deleteMany({ where: { id: { in: removable.map((r) => r.id) } } })
  }
  return { added, removed: removable.length }
}

// ─── Remap привязок itemId после замены строк оценки ─────────────────
// PUT оценки пересоздаёт BrokerEstimateItem (deleteMany + createMany) —
// привязки разрешительных к старым id восстанавливаются по коду ТН ВЭД;
// код исчез из ответа — привязка снимается (строка остаётся «ко всему»).
export async function remapPermitItemIds(
  tx: Prisma.TransactionClient,
  oldItems: { id: string; hsCode: string }[],
  newItems: { id: string; hsCode: string }[]
): Promise<number> {
  if (oldItems.length === 0) return 0
  const hsByOldId = new Map(oldItems.map((i) => [i.id, i.hsCode]))
  const newIdByHs = new Map(newItems.map((i) => [i.hsCode, i.id]))
  const bound = await tx.permitRequirement.findMany({
    where: { itemId: { in: [...hsByOldId.keys()] } },
    select: { id: true, itemId: true },
  })
  let remapped = 0
  for (const row of bound) {
    const hs = row.itemId ? hsByOldId.get(row.itemId) : undefined
    const nextId = hs ? (newIdByHs.get(hs) ?? null) : null
    if (nextId !== row.itemId) {
      await tx.permitRequirement.update({ where: { id: row.id }, data: { itemId: nextId } })
      remapped += 1
    }
  }
  return remapped
}

// Удаление документа возвращает строку в ожидание (lib/documents.ts).
// Событие не пишется: факт удаления уже в ленте (document_deleted).
// Пересчёт мяча — явный (recomputeAfterEvent): без события сделка
// осталась бы в awaiting_permit по строке, чей документ уже удалён.
export async function revertPermitDocument(documentId: string): Promise<void> {
  const affected = await db.permitRequirement.findMany({
    where: { documentId, status: 'received' },
    select: { id: true, orderId: true, leadId: true },
  })
  if (affected.length === 0) return
  await db.permitRequirement.updateMany({
    where: { id: { in: affected.map((r) => r.id) } },
    data: {
      status: 'pending',
      documentId: null,
      receivedAt: null,
      receivedByName: null,
      lastRemindedAt: null,
    },
  })
  const { recomputeAfterEvent } = await import('@/lib/waiting-db')
  for (const row of affected) {
    if (row.orderId) await recomputeAfterEvent(db, { orderId: row.orderId })
    else if (row.leadId) await recomputeAfterEvent(db, { leadId: row.leadId })
  }
}
