import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { emitEvent } from '@/lib/events'
import type { DocActor, DocumentDealTarget } from '@/lib/documents'
import type { ActivityActor } from '@/lib/activity'
import {
  CreatePermitInput,
  PatchPermitInput,
  type PermitProvider,
  fmtPermitDate,
  PERMIT_PROVIDER_LABELS,
  PERMIT_REJECT_REASON_MAX,
} from '@/lib/permits'

// ─── DF-16 + DF-26 волна 2: серверное ядро разрешительных документов ──
// Единая точка записи PermitRequirement (роуты валидируют и зовут отсюда,
// как documents.ts для Дорожки Е). События — только через emitEvent
// (гард DF-01); перечень исчерпывающий:
//   волна 1 (DF-16): permit_added / permit_received / permit_waived /
//   permit_overdue (скан диспетчера — notifications/permits-scan.ts);
//   волна 2 (SPEC §5.4/§5.7): permit_submitted (загрузка ≠ принятие),
//   permit_rejected (отклонение с причиной), permit_reopened (авто-возврат
//   принятого при новой версии/«Вернуть в работу», §6.4),
//   permit_relink_needed (дифф-сохранение оценки, §5.7 п. 0а — пишет
//   estimate-роут через syncEstimatePermits), permit_relinked (ручная
//   привязка в PATCH). Правка полей строки сотрудником (PATCH без смены
//   статуса/привязки) событий не пишет — факт виден по updatedAt.

// Полная проекция (staff; включает внутреннюю заметку и состояние
// привязки — метка «требует ручной привязки» только сотрудникам, §5.7).
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
  stageCode: true,
  source: true,
  bindingState: true,
  submittedAt: true,
  submittedByName: true,
  submittedByUserName: true,
  submittedByCompanyName: true,
  acceptedVersion: true,
  createdByType: true,
  createdByName: true,
  createdByUserName: true,
  createdByCompanyName: true,
  receivedByUserName: true,
  receivedByCompanyName: true,
  lastRemindedAt: true,
  createdAt: true,
} as const

// Наружная проекция (клиент/брокер): внутренняя заметка, служебные
// source/lastRemindedAt и состояние привязки не покидают сервер;
// двойные снимки исполнителей наружу не уходят (§6.1 — формат
// {userName, companyName} нужен только staff; наружу — одиночные
// снимки, как прежде: submittedByName/receivedByName).
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
  stageCode: true,
  submittedAt: true,
  submittedByName: true,
  acceptedVersion: true,
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

// ─── Двойной снимок исполнителя (§6.1) ───────────────────────────────
// Клиент/брокер: name = снимок КОМПАНИИ (наименее привилегированный),
// userName = имя человека на момент действия (если передан актёром);
// сотрудник: имя в обоих полях? НЕТ — компания «Logix» задним числом
// не подставляется: companyName = NULL, userName = имя сотрудника
// (правило бэкафила §10.2, теперь и в записи новых событий).
export function actorSnapshot(actor: DocActor): {
  name: string
  userName: string | null
  companyName: string | null
} {
  if (actor.type === 'client' || actor.type === 'broker') {
    return { name: actor.name, userName: actor.userName ?? null, companyName: actor.name }
  }
  return { name: actor.name, userName: actor.name, companyName: null }
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
  const snap = actor.type === 'system' ? null : actorSnapshot(actor as DocActor)
  const created = await tx.permitRequirement.create({
    data: {
      ...dealWhere(deal),
      title: input.title,
      providedBy: input.providedBy,
      isBlocking: input.isBlocking ?? false,
      neededBy: input.neededBy ? new Date(`${input.neededBy}T00:00:00.000Z`) : null,
      staffNote: input.staffNote ?? null,
      itemId: input.itemId ?? null,
      stageCode: input.stageCode ?? null,
      source: 'manual',
      createdByType: actor.type,
      createdById: actor.type === 'system' ? null : actor.id,
      createdByName: actor.type === 'system' ? 'Система' : actor.name,
      // DF-26 волна 2: двойной снимок автора (§6.1) — как у событий.
      createdByUserName: actor.type === 'system' ? null : (snap?.userName ?? null),
      createdByCompanyName: actor.type === 'system' ? null : (snap?.companyName ?? null),
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
// status='received'/'submitted' через PATCH запрещены (файл и решение
// сотрудника — через confirm и accept/reject); 'waived' — с причиной.
// itemId — ручная привязка (§5.7 п. 0а): валидный id АКТУАЛЬНОЙ строки
// оценки этой сделки или NULL «ко всей сделке»; снятие pending_manual —
// с событием permit_relinked (в деталях — из какой замороженной ссылки).
export async function patchPermit(
  permitId: string,
  input: PatchPermitInput,
  actor: ActivityActor,
  tx: Prisma.TransactionClient = db
): Promise<PermitRow | null> {
  const current = await tx.permitRequirement.findUnique({ where: { id: permitId }, select: PERMIT_FIELDS })
  if (!current) return null

  if (input.status === 'received' || input.status === 'submitted') {
    throw Object.assign(
      new Error('Строка закрывается загрузкой документа и решением сотрудника, а не правкой'),
      { statusCode: 400 },
    )
  }
  const waiving = input.status === 'waived' && current.status !== 'waived'
  if (waiving && !(input.waivedReason ?? '').trim()) {
    throw Object.assign(new Error('Укажите причину — почему документ не требуется'), { statusCode: 400 })
  }

  // ── Ручная привязка (§5.7 п. 0а, §11.1) ───────────────────────────
  // Смена itemId — только осознанное решение сотрудника: NULL («ко всей
  // сделке») или валидный id актуальной строки оценки ЭТОЙ сделки.
  let relinked = false
  let frozenFrom: string | null = null
  if (input.itemId !== undefined && input.itemId !== current.itemId) {
    if (input.itemId !== null) {
      const actual = await currentEstimateItemIds(tx, current)
      if (!actual.has(input.itemId)) {
        throw Object.assign(
          new Error('Строка оценки не найдена — привязка возможна только к актуальной строке этой сделки'),
          { statusCode: 400 },
        )
      }
      // У позиции не должно быть другого активного требования с тем же
      // названием (дублирование по позиции → 400).
      const dup = await tx.permitRequirement.findFirst({
        where: {
          id: { not: current.id },
          itemId: input.itemId,
          title: { equals: current.title, mode: 'insensitive' },
          status: { in: ['pending', 'submitted'] },
        },
        select: { id: true },
      })
      if (dup) {
        throw Object.assign(
          new Error('У этой позиции уже есть активное требование с тем же названием'),
          { statusCode: 400 },
        )
      }
    }
    if (current.bindingState === 'pending_manual') {
      relinked = true
      frozenFrom = current.itemId
    }
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
      ...(input.stageCode !== undefined ? { stageCode: input.stageCode } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.waivedReason !== undefined ? { waivedReason: input.waivedReason } : {}),
      // Ручная привязка снимает «требует ручной привязки»; замороженная
      // ссылка заменяется выбранной (или NULL «ко всей сделке»).
      ...(input.itemId !== undefined && current.bindingState === 'pending_manual'
        ? { bindingState: 'bound' as const }
        : {}),
      // Правка полученной строки не трогает факт получения; снятие
      // «не требуется» возвращает строку в ожидание.
      ...(input.status === 'pending' && current.status !== 'pending'
        ? {
            documentId: null,
            receivedAt: null,
            receivedByName: null,
            receivedByUserName: null,
            receivedByCompanyName: null,
            acceptedVersion: null,
            submittedAt: null,
            submittedByName: null,
            submittedByUserName: null,
            submittedByCompanyName: null,
            waivedReason: null,
            lastRemindedAt: null,
          }
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
  if (relinked) {
    // §5.7 п. 0а: в деталях события — из какой замороженной ссылки.
    const to = updated.itemId
      ? `строка оценки ${updated.itemId}`
      : 'ко всей сделке (без позиции)'
    await emitEvent(tx, {
      target: permitTargetOf(updated),
      actor,
      type: 'permit_relinked',
      description: `Требование «${updated.title}» привязано вручную: ${to} (замороженная ссылка ${frozenFrom ?? '—'} после удаления строки оценки)`,
    })
  }
  return updated
}

/** Актуальные строки оценки сделки (для валидации ручной привязки). */
export async function currentEstimateItemIds(
  tx: Prisma.TransactionClient,
  permit: { orderId: string | null; leadId: string | null }
): Promise<Set<string>> {
  let leadId: string | null = permit.leadId
  if (permit.orderId) {
    const order = await tx.order.findUnique({
      where: { id: permit.orderId },
      select: { leadId: true },
    })
    leadId = order?.leadId ?? null
  }
  if (!leadId) return new Set()
  const links = await tx.leadBroker.findMany({
    where: { leadId },
    select: { estimate: { select: { items: { select: { id: true } } } } },
  })
  const ids = new Set<string>()
  for (const l of links) for (const i of l.estimate?.items ?? []) ids.add(i.id)
  return ids
}

// ─── Загрузка по требованию: pending → submitted (§5.4, волна 2) ─────
// С двухфазной загрузкой строка переходит в submitted на шаге confirm
// документа: тот же tx пишет снимок загрузившего и permit_submitted
// (событие в той же транзакции, DoD 9). Один документ может
// закрывать несколько требований (permitRequirementIds на confirm,
// §6.4 п. 1) — по строке-снимку на каждое. Повторное закрытие
// submitted/received строки — 409 (правка документа — версиями).
export async function linkPermitRequirements(
  tx: Prisma.TransactionClient,
  input: { permitIds: string[]; deal: DocumentDealTarget; actor: DocActor; documentId: string }
): Promise<number> {
  let linked = 0
  for (const permitId of input.permitIds) {
    const permit = await tx.permitRequirement.findUnique({
      where: { id: permitId },
      select: { id: true, title: true, status: true, orderId: true, leadId: true },
    })
    if (!permit) throw new PermitLinkError(404, 'Разрешительный документ не найден')
    // Строка обязана принадлежать той же сделке, что и документ: чужую
    // строку другой сделки к своему документу привязать нельзя.
    const sameDeal =
      ('orderId' in input.deal && permit.orderId === input.deal.orderId) ||
      ('leadId' in input.deal && permit.leadId === input.deal.leadId)
    if (!sameDeal) throw new PermitLinkError(404, 'Разрешительный документ не найден')
    if (permit.status !== 'pending') {
      throw new PermitLinkError(409, 'Строка уже закрыта — документ прикладывается версиями к загруженному')
    }
    const snap = actorSnapshot(input.actor)
    // Атомарный переход: гонка двух confirm по одной строке ловится
    // фильтром статуса (второй получает 409 — §11.2).
    const flipped = await tx.permitRequirement.updateMany({
      where: { id: permit.id, status: 'pending' },
      data: {
        status: 'submitted',
        documentId: input.documentId,
        submittedAt: new Date(),
        submittedByName: snap.name,
        submittedByUserName: snap.userName,
        submittedByCompanyName: snap.companyName,
        lastRemindedAt: null,
      },
    })
    if (flipped.count === 0) {
      throw new PermitLinkError(409, 'Строка уже закрыта — документ прикладывается версиями к загруженному')
    }
    await emitEvent(tx, {
      target: input.deal,
      actor: input.actor,
      type: 'permit_submitted',
      description: `Разрешительный документ «${permit.title}» загружен (${snap.name}) — на проверке`,
      documentId: input.documentId,
    })
    linked += 1
  }
  return linked
}

/** Ошибка привязки строки разрешительного — роут маппит в HTTP-ответ. */
export class PermitLinkError extends Error {
  readonly statusCode: number
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
    this.statusCode = status
  }
}

// ─── «Принять» (submitted → received, только сотрудник, §5.4/§11.2) ──
// acceptedVersion — фактически принятая версия связанного документа
// (текущая на момент нажатия); двойной снимок принявшего; 409 на
// повторный accept (updateMany с фильтром статуса).
export async function acceptPermit(
  permitId: string,
  actor: Extract<DocActor, { type: 'employee' }>,
  tx: Prisma.TransactionClient = db
): Promise<PermitRow> {
  const permit = await tx.permitRequirement.findUnique({
    where: { id: permitId },
    select: { id: true, title: true, status: true, orderId: true, leadId: true, documentId: true },
  })
  if (!permit) throw new PermitLinkError(404, 'Разрешительный документ не найден')
  if (permit.status !== 'submitted') {
    throw new PermitLinkError(409, 'Принять можно строку «На проверке»')
  }
  let acceptedVersion: number | null = null
  if (permit.documentId) {
    const doc = await tx.document.findUnique({
      where: { id: permit.documentId },
      select: { currentVersion: true },
    })
    acceptedVersion = doc?.currentVersion ?? null
  }
  const flipped = await tx.permitRequirement.updateMany({
    where: { id: permit.id, status: 'submitted' },
    data: {
      status: 'received',
      receivedAt: new Date(),
      receivedByName: actor.name,
      receivedByUserName: actor.name,
      receivedByCompanyName: null,
      ...(acceptedVersion !== null ? { acceptedVersion } : {}),
    },
  })
  if (flipped.count === 0) {
    throw new PermitLinkError(409, 'Принять можно строку «На проверке»')
  }
  await emitEvent(tx, {
    target: permit.orderId ? { orderId: permit.orderId } : { leadId: permit.leadId! },
    actor,
    type: 'permit_received',
    description: `Разрешительный документ «${permit.title}» принят (${actor.name})${acceptedVersion ? ` — версия ${acceptedVersion}` : ''}`,
    documentId: permit.documentId ?? undefined,
  })
  const updated = await tx.permitRequirement.findUnique({ where: { id: permit.id }, select: PERMIT_FIELDS })
  return updated as PermitRow
}

// ─── «Отклонить» (submitted → pending, только сотрудник, §5.4) ───────
// Причина обязательна; документ остаётся в заявке (можно заменить
// версией или загрузить другой); контроль снова активен (скан и
// плашка) — lastRemindedAt сбрасывается. Причина и снимок отклонившего
// — в событии (отдельных колонок нет, §6.1/§10.2).
export async function rejectPermit(
  permitId: string,
  actor: Extract<DocActor, { type: 'employee' }>,
  reason: string,
  tx: Prisma.TransactionClient = db
): Promise<PermitRow> {
  const trimmed = reason.trim()
  if (!trimmed || trimmed.length > PERMIT_REJECT_REASON_MAX) {
    throw new PermitLinkError(400, `Укажите причину отклонения (до ${PERMIT_REJECT_REASON_MAX} символов)`)
  }
  const permit = await tx.permitRequirement.findUnique({
    where: { id: permitId },
    select: { id: true, title: true, status: true, orderId: true, leadId: true, documentId: true },
  })
  if (!permit) throw new PermitLinkError(404, 'Разрешительный документ не найден')
  if (permit.status !== 'submitted') {
    throw new PermitLinkError(409, 'Отклонить можно строку «На проверке»')
  }
  const flipped = await tx.permitRequirement.updateMany({
    where: { id: permit.id, status: 'submitted' },
    data: {
      status: 'pending',
      lastRemindedAt: null,
    },
  })
  if (flipped.count === 0) {
    throw new PermitLinkError(409, 'Отклонить можно строку «На проверке»')
  }
  await emitEvent(tx, {
    target: permit.orderId ? { orderId: permit.orderId } : { leadId: permit.leadId! },
    actor,
    type: 'permit_rejected',
    description: `Разрешительный документ «${permit.title}» отклонён (${actor.name}): ${trimmed}`,
    documentId: permit.documentId ?? undefined,
  })
  const updated = await tx.permitRequirement.findUnique({ where: { id: permit.id }, select: PERMIT_FIELDS })
  return updated as PermitRow
}

// ─── Авто-закрытие при финализации документа (§5.4/§11.1, волна 2) ───
// finalize документа закрывает связанные submitted-требования в
// received: acceptedVersion = объявленная финальной версия; по строке
// на каждое требование. Вызывается ядром lifecycle в той же транзакции.
export async function closePermitsOnFinalize(
  tx: Prisma.TransactionClient,
  input: { documentId: string; documentTitle: string; finalVersion: number; actor: Extract<DocActor, { type: 'employee' }> }
): Promise<number> {
  const rows = await tx.permitRequirement.findMany({
    where: { documentId: input.documentId, status: 'submitted' },
    select: { id: true, title: true, orderId: true, leadId: true },
  })
  if (rows.length === 0) return 0
  await tx.permitRequirement.updateMany({
    where: { id: { in: rows.map((r) => r.id) }, status: 'submitted' },
    data: {
      status: 'received',
      receivedAt: new Date(),
      receivedByName: input.actor.name,
      receivedByUserName: input.actor.name,
      receivedByCompanyName: null,
      acceptedVersion: input.finalVersion,
    },
  })
  for (const row of rows) {
    await emitEvent(tx, {
      target: row.orderId ? { orderId: row.orderId } : { leadId: row.leadId! },
      actor: input.actor,
      type: 'permit_received',
      description: `Разрешительный документ «${row.title}» принят автоматически — документ «${input.documentTitle}» финализирован (версия ${input.finalVersion})`,
      documentId: input.documentId,
    })
  }
  return rows.length
}

// ─── Авто-возврат принятых требований (§6.4 п. 3–4, волна 2) ─────────
// У связанного документа появилось новое содержимое («Вернуть в работу»
// — отзыв финальной версии, или добавлена новая версия): пересчёт ПО
// КАЖДОМУ требованию — возвращаются только ранее принятые (received);
// непринятое (submitted) своё состояние не меняет. acceptedVersion и
// снимки прежнего принятия НЕ затираются — «ранее принята версия N».
// Событие permit_reopened — по одному на каждое переоткрытое.
export async function reopenPermitsForDocument(
  tx: Prisma.TransactionClient,
  input: { documentId: string; documentTitle: string; actor: DocActor; reason: string }
): Promise<number> {
  const rows = await tx.permitRequirement.findMany({
    where: { documentId: input.documentId, status: 'received' },
    select: { id: true, title: true, orderId: true, leadId: true },
  })
  if (rows.length === 0) return 0
  await tx.permitRequirement.updateMany({
    where: { id: { in: rows.map((r) => r.id) }, status: 'received' },
    data: { status: 'submitted' },
  })
  for (const row of rows) {
    await emitEvent(tx, {
      target: row.orderId ? { orderId: row.orderId } : { leadId: row.leadId! },
      actor: input.actor,
      type: 'permit_reopened',
      description: `Разрешительный документ «${row.title}» возвращён на проверку — ${input.reason}`,
      documentId: input.documentId,
    })
  }
  return rows.length
}

// ─── Перенос при конвертации В4 (лид → заявка) ───────────────────────
// Идемпотентен (updateMany с фильтром), как carryDocumentsToOrder.
// stageCode/submittedAt/acceptedVersion и снимки — колонки строки,
// переносятся вместе с ней (§10.3 п. 6).
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

// ─── Перенос проверок ТН ВЭД при конвертации (§10.3 п. 6) ────────────
// PermitCheck переносится аналогично (вместе с reviewStatus); строки
// PermitCheckItem/PermitCheckRequirement ссылаются на проверку и
// требование по id — переносятся автоматически (своих колонок цели нет).
export async function carryPermitChecksToOrder(
  leadId: string,
  orderId: string,
  tx?: Prisma.TransactionClient
): Promise<number> {
  const client = tx ?? db
  const res = await client.permitCheck.updateMany({
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
    const snap = actor.type === 'system' ? null : actorSnapshot(actor as DocActor)
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
        createdByUserName: actor.type === 'system' ? null : (snap?.userName ?? null),
        createdByCompanyName: actor.type === 'system' ? null : (snap?.companyName ?? null),
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

// Удаление документа возвращает строки в ожидание (§5.4: received и
// submitted → pending; контроль восстановлен у всех, событие одно —
// document_deleted уже в ленте). Снимки загрузки/принятия и
// acceptedVersion очищаются вместе с привязкой документа. Пересчёт
// мяча — явный (recomputeAfterEvent): без события сделка осталась бы
// в awaiting_permit по строке, чей документ уже удалён.
export async function revertPermitDocument(documentId: string): Promise<void> {
  const affected = await db.permitRequirement.findMany({
    where: { documentId, status: { in: ['received', 'submitted'] } },
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
      receivedByUserName: null,
      receivedByCompanyName: null,
      submittedAt: null,
      submittedByName: null,
      submittedByUserName: null,
      submittedByCompanyName: null,
      acceptedVersion: null,
      lastRemindedAt: null,
    },
  })
  const { recomputeAfterEvent } = await import('@/lib/waiting-db')
  for (const row of affected) {
    if (row.orderId) await recomputeAfterEvent(db, { orderId: row.orderId })
    else if (row.leadId) await recomputeAfterEvent(db, { leadId: row.leadId })
  }
}
