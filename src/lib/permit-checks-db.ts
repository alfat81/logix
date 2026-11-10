import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { emitEvent } from '@/lib/events'
import type { DocActor, DocumentDealTarget } from '@/lib/documents'
import {
  CreatePermitCheckInput,
  ReviewPermitCheckInput,
  PERMIT_CHECK_RESULT_LABELS,
  PERMIT_CHECK_REVIEW_OUTCOME_LABELS,
  manualDictionaryVersion,
  outcomeFromDecisions,
  type PermitCheckResult,
} from '@/lib/permit-checks'
import { actorSnapshot, PermitLinkError } from '@/lib/permits-db'

// ─── DF-26 волна 2: серверное ядро проверок ТН ВЭД (SPEC §5.1–5.3, §5.7) ──
// Единая точка записи PermitCheck/PermitCheckItem/PermitCheckRequirement.
// Инварианты закреплены БД (CHECK «ровно одна цель», частичные уникальные
// индексы открытых записей, UNIQUE пары связей — миграция df_26_docs_center);
// здесь — дедупликация поверх 23505 (объединение, §11.2) и advisory-блоки-
// ровка сделки для потоков, создающих/снимающих требования (§5.1 (б)).

// Проекция строки проверки (staff; брокеру отдаётся тем же составом —
// секретных полей нет, снимок проверившего — часть истории, §6.1).
export const PERMIT_CHECK_FIELDS = {
  id: true,
  orderId: true,
  leadId: true,
  hsCode: true,
  reviewItemId: true,
  result: true,
  basis: true,
  dictionaryVersion: true,
  source: true,
  checkedByType: true,
  checkedById: true,
  checkedByName: true,
  checkedByUserName: true,
  checkedByCompanyName: true,
  reviewOfCheckId: true,
  reviewStatus: true,
  reviewedAt: true,
  reviewedByUserName: true,
  reviewedByCompanyName: true,
  reviewOutcome: true,
  createdAt: true,
} as const

export type PermitCheckRow = Prisma.PermitCheckGetPayload<{ select: typeof PERMIT_CHECK_FIELDS }>

export function checkDealTarget(check: { orderId: string | null; leadId: string | null }): DocumentDealTarget {
  if (check.orderId) return { orderId: check.orderId }
  if (check.leadId) return { leadId: check.leadId }
  throw new Error('PermitCheck без цели-сделки — нарушение инварианта')
}

function dealWhereOf(deal: DocumentDealTarget) {
  return 'orderId' in deal ? { orderId: deal.orderId } : { leadId: deal.leadId }
}

/** Актуальные строки оценки сделки (все брокеры лида) — id + код. */
export async function currentEstimateItems(
  tx: Prisma.TransactionClient,
  deal: DocumentDealTarget
): Promise<{ id: string; hsCode: string }[]> {
  let leadId: string | null = 'leadId' in deal ? deal.leadId : null
  if ('orderId' in deal) {
    const order = await tx.order.findUnique({ where: { id: deal.orderId }, select: { leadId: true } })
    leadId = order?.leadId ?? null
  }
  if (!leadId) return []
  const links = await tx.leadBroker.findMany({
    where: { leadId },
    select: { estimate: { select: { items: { select: { id: true, hsCode: true } } } } },
  })
  return links.flatMap((l) => l.estimate?.items ?? [])
}

/** Advisory-блокировка сделки в транзакции (§5.1 (б)). */
export async function lockDeal(tx: Prisma.TransactionClient, deal: DocumentDealTarget): Promise<void> {
  const id = 'orderId' in deal ? deal.orderId : deal.leadId
  // $executeRaw (не $queryRaw): pg_advisory_xact_lock возвращает void —
  // дезериализовать нечего, а пустой результат $queryRaw ломает парсер.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${id}))`
}

// ─── Открытая auto-запись кода (дедупликация инварианта 1) ───────────
async function findOpenUnclear(
  tx: Prisma.TransactionClient,
  deal: DocumentDealTarget,
  hsCode: string
): Promise<{ id: string } | null> {
  return tx.permitCheck.findFirst({
    where: {
      ...dealWhereOf(deal),
      hsCode,
      source: 'auto',
      result: 'unclear',
      reviewStatus: 'none',
    },
    select: { id: true },
  })
}

/** Связи «проверка → позиции» кода, поддерживаемые в актуальном составе. */
async function linkItems(
  tx: Prisma.TransactionClient,
  checkId: string,
  itemIds: string[]
): Promise<void> {
  if (itemIds.length === 0) return
  await tx.permitCheckItem.createMany({
    data: itemIds.map((itemId) => ({ permitCheckId: checkId, itemId })),
    // UNIQUE (permitCheckId, itemId): повторное присоединение той же
    // позиции дубля не создаёт (инвариант §5.1, замечание 2 ред. 1.4).
    skipDuplicates: true,
  })
}

// ─── Auto-запись при появлении кода (§5.2, триггер 1) ────────────────
// Одна открытая unclear-запись на (сделка, код) + связи со ВСЕМИ
// позициями кода + событие permit_check_needed (по одному разу на пару).
// Гонка двух параллельных созданий ловится частичным уникальным индексом
// (23505 → объединение с существующей записью — дублей нет, §11.2).
export async function ensureAutoPermitCheck(
  tx: Prisma.TransactionClient,
  input: { deal: DocumentDealTarget; hsCode: string; actor: ActivityLike }
): Promise<string> {
  const { deal, hsCode } = input
  const existing = await findOpenUnclear(tx, deal, hsCode)
  if (existing) {
    // Охват открытой записи — все позиции сделки с этим кодом (инв. 3).
    const items = (await currentEstimateItems(tx, deal)).filter((i) => i.hsCode === hsCode)
    await linkItems(tx, existing.id, items.map((i) => i.id))
    return existing.id
  }
  try {
    const created = await tx.permitCheck.create({
      data: {
        ...dealWhereOf(deal),
        hsCode,
        result: 'unclear',
        source: 'auto',
        reviewStatus: 'none',
        checkedByType: 'system',
        checkedByName: 'Система',
        // Инвариант 2: система никогда не создаёт требования сама —
        // auto-запись всегда unclear до явного решения человека.
      },
      select: { id: true },
    })
    const items = (await currentEstimateItems(tx, deal)).filter((i) => i.hsCode === hsCode)
    await linkItems(tx, created.id, items.map((i) => i.id))
    await emitEvent(tx, {
      target: deal,
      actor: { type: 'system' },
      type: 'permit_check_needed',
      description: `Требуется проверка разрешительных по коду ТН ВЭД ${hsCode} (позиций: ${items.length})`,
    })
    return created.id
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      // Гонка: вторая открытая запись на (сделка, код) запрещена БД —
      // объединяемся с уже созданной (§11.2 (а)).
      const winner = await findOpenUnclear(tx, deal, hsCode)
      if (winner) return winner.id
    }
    throw e
  }
}

type ActivityLike = DocActor | { type: 'system' }

// ─── Гашение опустевшей открытой записи (§5.2) ───────────────────────
// Открытая auto-запись без связей, без документа у требований и без
// требований гасится. Строки не удаляются (ссылки reviewOfCheckId
// остаются валидными) — инженерное решение по умолчанию (§14.2):
// result='failed' («проверка не выполнена») с основанием о причине
// гашения; запись уходит из открытого множества частичного индекса.
async function extinguishIfEmpty(
  tx: Prisma.TransactionClient,
  checkId: string
): Promise<boolean> {
  const check = await tx.permitCheck.findUnique({
    where: { id: checkId },
    select: {
      id: true,
      hsCode: true,
      source: true,
      result: true,
      reviewStatus: true,
      _count: { select: { items: true, requirements: true } },
    },
  })
  if (!check) return false
  if (check.source !== 'auto' || check.result !== 'unclear' || check.reviewStatus !== 'none') return false
  if (check._count.items > 0 || check._count.requirements > 0) return false
  await tx.permitCheck.update({
    where: { id: checkId },
    data: {
      result: 'failed',
      basis: 'Код исчез из сделки (позиции удалены) — открытая проверка погашена',
    },
  })
  return true
}

// ─── Изменение кода позиции (§5.7 п. 0/2/2а) ─────────────────────────
// Ничего не переносится и не пересоздаётся: связь требования с позицией
// (по id строки) сохраняется; фиксируется потребность пересмотра —
// одна открытая needs_review-запись на (сделка, позиция) с
// reviewOfCheckId → предыдущей проверке позиции. Повторная смена кода
// обновляет открытую запись (id и reviewOfCheckId сохраняются), событие
// — на каждую смену. Код, вернувшийся к прежнему значению, завершает
// пересмотр исходом requirement_kept автоматически (§5.7 п. 2а).
export async function handleHsCodeChange(
  tx: Prisma.TransactionClient,
  input: {
    deal: DocumentDealTarget
    itemId: string
    oldCode: string
    newCode: string
    actor: ActivityLike
  }
): Promise<void> {
  const { deal, itemId, oldCode, newCode } = input
  if (oldCode === newCode) return

  // Транзакционная защита (§5.1 (а)): SELECT … FOR UPDATE открытой
  // needs_review-записи позиции.
  const open = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "PermitCheck"
    WHERE "reviewStatus" = 'needs_review'
      AND "reviewItemId" = ${itemId}
      AND ("orderId" = ${'orderId' in deal ? deal.orderId : null}
        OR "leadId" = ${'leadId' in deal ? deal.leadId : null})
    FOR UPDATE`
    .then((rows) => rows[0] ?? null)

  if (open) {
    const current = await tx.permitCheck.findUnique({
      where: { id: open.id },
      select: { id: true, hsCode: true, reviewOfCheckId: true, reviewOf: { select: { hsCode: true } } },
    })
    if (!current) return
    if (current.reviewOf?.hsCode && newCode === current.reviewOf.hsCode) {
      // Код вернулся к прежнему значению — пересмотр завершается сам:
      // requirement_kept с основанием «код возвращён к …» (п. 2а).
      await tx.permitCheck.update({
        where: { id: current.id },
        data: {
          hsCode: newCode,
          reviewStatus: 'reviewed',
          reviewedAt: new Date(),
          reviewOutcome: 'requirement_kept',
        },
      })
      await emitEvent(tx, {
        target: deal,
        actor: { type: 'system' },
        type: 'permit_check_reviewed',
        description: `Код ТН ВЭД позиции возвращён к ${newCode} — пересмотр завершён автоматически, требование остаётся в силе`,
      })
      return
    }
    await tx.permitCheck.update({
      where: { id: current.id },
      data: { hsCode: newCode },
    })
    await emitEvent(tx, {
      target: deal,
      actor: { type: 'system' },
      type: 'permit_check_review_needed',
      description: `Код ТН ВЭД позиции изменён ${oldCode} → ${newCode} — требуется пересмотр проверки`,
    })
    return
  }

  // Предыдущая проверка позиции — последняя по времени (охват связью
  // или reviewItemId), для reviewOfCheckId.
  const previous = await tx.permitCheck.findFirst({
    where: {
      OR: [{ items: { some: { itemId } } }, { reviewItemId: itemId }],
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  })
  try {
    await tx.permitCheck.create({
      data: {
        ...dealWhereOf(deal),
        hsCode: newCode,
        result: 'unclear',
        source: 'auto',
        reviewStatus: 'needs_review',
        reviewItemId: itemId,
        reviewOfCheckId: previous?.id ?? null,
        checkedByType: 'system',
        checkedByName: 'Система',
      },
      select: { id: true },
    })
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      // Гонка двух параллельных изменений кода: вторая needs_review на
      // (сделка, позиция) запрещена БД — обновляем открытую (§11.2 (а)).
      await tx.permitCheck.updateMany({
        where: { reviewStatus: 'needs_review', reviewItemId: itemId },
        data: { hsCode: newCode },
      })
      await emitEvent(tx, {
        target: deal,
        actor: { type: 'system' },
        type: 'permit_check_review_needed',
        description: `Код ТН ВЭД позиции изменён ${oldCode} → ${newCode} — требуется пересмотр проверки`,
      })
      return
    }
    throw e
  }
  await emitEvent(tx, {
    target: deal,
    actor: { type: 'system' },
    type: 'permit_check_review_needed',
    description: `Код ТН ВЭД позиции изменён ${oldCode} → ${newCode} — требуется пересмотр проверки`,
  })
}

// ─── Синхронизация после дифф-сохранения оценки (§5.7 п. 0а) ─────────
// Вызывается estimate-роутом в ТОЙ ЖЕ транзакции (advisory-блокировка
// сделки): (а) удалённые строки — требования в pending_manual с
// замороженной ссылкой и событием permit_relink_needed на каждое;
// (б) охват открытых auto-записей синхронизируется с актуальными строками
// кода; (в) новая позиция с известным кодом — присоединяется к открытой
// записи (или событие, если код уже подтверждён — инвариант 2);
// (г) опустевшие открытые записи гасятся.
export async function syncAfterEstimateDiff(
  tx: Prisma.TransactionClient,
  input: {
    deal: DocumentDealTarget
    actor: ActivityLike
    removedItemIds: string[]
    addedItemIds: string[]
  }
): Promise<void> {
  const { deal, removedItemIds, addedItemIds } = input

  // (а) Удалённые строки: требования получают pending_manual (itemId
  // сохранён — замороженная ссылка, не NULL; NULL только осознанным
  // решением «ко всей сделке»); события — на каждое затронутое.
  if (removedItemIds.length > 0) {
    await tx.permitCheckItem.deleteMany({ where: { itemId: { in: removedItemIds } } })
    const affected = await tx.permitRequirement.findMany({
      where: { itemId: { in: removedItemIds }, bindingState: 'bound' },
      select: { id: true, title: true, orderId: true, leadId: true },
    })
    if (affected.length > 0) {
      await tx.permitRequirement.updateMany({
        where: { id: { in: affected.map((r) => r.id) } },
        data: { bindingState: 'pending_manual' },
      })
      for (const row of affected) {
        await emitEvent(tx, {
          target: row.orderId ? { orderId: row.orderId } : { leadId: row.leadId! },
          actor: input.actor,
          type: 'permit_relink_needed',
          description: `Требование «${row.title}»: связь с позицией требует ручного подтверждения — позиция удалена из оценки`,
        })
      }
    }
    // needs_review-записи удалённых позиций сохраняют замороженную
    // ссылку (reviewItemId) — пересмотр выполняется по факту (§5.7 п. 0а).
  }

  // (б)+(в) Охват и новые позиции — по кодам актуальных строк.
  const items = await currentEstimateItems(tx, deal)
  const byCode = new Map<string, string[]>()
  for (const i of items) {
    const list = byCode.get(i.hsCode) ?? []
    list.push(i.id)
    byCode.set(i.hsCode, list)
  }
  const openUnclears = await tx.permitCheck.findMany({
    where: {
      ...dealWhereOf(deal),
      source: 'auto',
      result: 'unclear',
      reviewStatus: 'none',
      hsCode: { in: [...byCode.keys()] },
    },
    select: { id: true, hsCode: true, _count: { select: { items: true, requirements: true } } },
  })
  const openByCode = new Map(openUnclears.map((c) => [c.hsCode, c]))

  for (const [hsCode, itemIds] of byCode) {
    const open = openByCode.get(hsCode)
    if (open) {
      // Синхронизация охвата открытой записи с актуальными строками кода.
      await tx.permitCheckItem.deleteMany({
        where: { permitCheckId: open.id, itemId: { notIn: itemIds } },
      })
      const mine = itemIds.filter((id) => addedItemIds.includes(id))
      if (mine.length > 0) {
        const before = open._count.items
        await linkItems(tx, open.id, mine)
        if (before === 0) {
          // Запись была без связей (погашение отменено появлением новой
          // позиции?) — невозможный случай: погашенная уходит из open-
          // выборки. Ничего дополнительно не делаем.
        }
      }
    } else {
      // Новая позиция с кодом, по которому открытой записи нет:
      // создаём auto-запись (или событие, если код уже подтверждён —
      // требование автоматически не создаётся, инвариант 2).
      await ensureAutoPermitCheck(tx, { deal, hsCode, actor: input.actor })
    }
  }

  // (г) Опустевшие открытые записи кодов, исчезнувших из сделки.
  const allOpen = await tx.permitCheck.findMany({
    where: {
      ...dealWhereOf(deal),
      source: 'auto',
      result: 'unclear',
      reviewStatus: 'none',
    },
    select: { id: true },
  })
  for (const c of allOpen) {
    if (!byCode.has((await tx.permitCheck.findUnique({ where: { id: c.id }, select: { hsCode: true } }))?.hsCode ?? '')) {
      await extinguishIfEmpty(tx, c.id)
    }
  }
}

// ─── Ручная проверка (кнопка «Проверить», §5.2/§5.3/§11.2) ───────────
// Параметра itemId НЕТ: охват определяется кодом автоматически. Пишется
// НОВАЯ запись (история проверок сохраняется); result='required' создаёт
// требования по охваченным позициям БЕЗ активного требования по коду +
// строки PermitCheckRequirement (происхождение — сразу), в одной
// транзакции с advisory-блокировкой сделки.
export async function createManualPermitCheck(
  deal: DocumentDealTarget,
  input: CreatePermitCheckInput,
  actor: ActivityLike
): Promise<PermitCheckRow> {
  return db.$transaction(async (mtx) => {
    await lockDeal(mtx, deal)
    const snap = actor.type === 'system' ? null : actorSnapshot(actor as DocActor)
    const items = (await currentEstimateItems(mtx, deal)).filter((i) => i.hsCode === input.hsCode)

    const created = await mtx.permitCheck.create({
      data: {
        ...dealWhereOf(deal),
        hsCode: input.hsCode,
        result: input.result,
        basis: input.basis?.trim() || null,
        dictionaryVersion: input.dictionaryVersion?.trim() || manualDictionaryVersion(),
        source: 'manual',
        checkedByType: actor.type,
        checkedById: actor.type === 'system' ? null : actor.id,
        checkedByName: actor.type === 'system' ? 'Система' : actor.name,
        checkedByUserName: snap?.userName ?? null,
        checkedByCompanyName: snap?.companyName ?? null,
      },
      select: PERMIT_CHECK_FIELDS,
    })
    await linkItems(mtx, created.id, items.map((i) => i.id))

    if (input.result === 'required' && input.requirement) {
      const req = input.requirement
      const normTitle = req.title.trim().toLowerCase()
      // Активные требования сделки (для проверки дублей по позициям).
      const existingReqs = await mtx.permitRequirement.findMany({
        where: { ...dealWhereOf(deal), status: { in: ['pending', 'submitted'] } },
        select: { id: true, title: true, itemId: true },
      })
      const hasActive = (itemId: string | null) =>
        existingReqs.some(
          (r) => r.itemId === itemId && r.title.trim().toLowerCase() === normTitle
        )
      const targets: (string | null)[] = items.length > 0 ? items.map((i) => i.id) : [null]
      const needed = targets.filter((itemId) => !hasActive(itemId))
      const dealKey = dealWhereOf(deal)
      for (const itemId of needed) {
        const requirement = await mtx.permitRequirement.create({
          data: {
            ...dealKey,
            title: req.title.trim(),
            providedBy: req.providedBy,
            isBlocking: req.isBlocking ?? false,
            neededBy: req.neededBy ? new Date(`${req.neededBy}T00:00:00.000Z`) : null,
            stageCode: req.stageCode ?? null,
            itemId,
            source: 'manual',
            createdByType: actor.type,
            createdById: actor.type === 'system' ? null : actor.id,
            createdByName: actor.type === 'system' ? 'Система' : actor.name,
            createdByUserName: snap?.userName ?? null,
            createdByCompanyName: snap?.companyName ?? null,
          },
          select: { id: true },
        })
        // Происхождение — сразу (§5.3): строка «проверка → требование».
        await mtx.permitCheckRequirement.create({
          data: { permitCheckId: created.id, permitRequirementId: requirement.id },
        })
        await emitEvent(mtx, {
          target: deal,
          actor,
          type: 'permit_added',
          description: `Разрешительный документ «${req.title.trim()}» — предоставить: ${
            { client: 'клиент', broker: 'брокер', staff: 'сотрудник' }[req.providedBy]
          } (по проверке кода ${input.hsCode}${itemId ? '' : ', ко всей сделке'})`,
        })
      }
    }

    if (input.result === 'not_required') {
      await emitEvent(mtx, {
        target: deal,
        actor,
        type: 'permit_check_not_required',
        description: `По коду ТН ВЭД ${input.hsCode} разрешительный документ не требуется — ${input.basis?.trim() ?? 'основание указано'}`,
      })
      // Открытая auto-запись кода гасится: вопрос закрыт ручной
      // проверкой (инженерное решение по умолчанию, см. extinguishIfEmpty).
      const open = await findOpenUnclear(mtx, deal, input.hsCode)
      if (open) {
        await mtx.permitCheck.update({
          where: { id: open.id },
          data: { result: 'failed', basis: 'Погашена ручной проверкой кода' },
        })
      }
    }

    return created
  })
}

// ─── Пересмотр при изменении кода (§5.7 п. 3/3а, §11.2) ──────────────
// Только уполномоченный сотрудник (роут). Атомарный захват открытой
// needs_review-записи (updateMany по статусу) → 409 повторному; решения
// по КАЖДОМУ активному требованию позиции; снятия/создания — той же
// транзакцией; созданные на замороженной позиции — pending_manual.
export async function reviewPermitCheck(
  checkId: string,
  input: ReviewPermitCheckInput,
  actor: Extract<DocActor, { type: 'employee' }>
): Promise<PermitCheckRow> {
  return db.$transaction(async (mtx) => {
    const check = await mtx.permitCheck.findUnique({ where: { id: checkId }, select: PERMIT_CHECK_FIELDS })
    if (!check) throw new PermitLinkError(404, 'Проверка не найдена')
    if (check.reviewStatus !== 'needs_review') {
      throw new PermitLinkError(409, 'Пересмотр выполняется только по открытой записи «требует пересмотра»')
    }
    const deal = checkDealTarget(check)

    // Атомарный захват (§11.2 (в)): повторный review получает 409.
    const captured = await mtx.permitCheck.updateMany({
      where: { id: check.id, reviewStatus: 'needs_review' },
      data: { updatedAt: new Date() },
    })
    if (captured.count === 0) {
      throw new PermitLinkError(409, 'Пересмотр уже выполняется — обновите список')
    }

    // Активные требования позиции (или сделочные — у пересмотра без позиции).
    const activeReqs = await mtx.permitRequirement.findMany({
      where: {
        ...dealWhereOf(deal),
        status: { in: ['pending', 'submitted'] },
        itemId: check.reviewItemId,
      },
      select: { id: true, title: true, itemId: true },
    })

    // Валидация решений: по каждому активному — ровно одно решение (400).
    const decisions = input.decisions ?? []
    if (activeReqs.length > 0) {
      const decided = new Set(decisions.map((d) => d.requirementId))
      const missing = activeReqs.filter((r) => !decided.has(r.id))
      if (missing.length > 0) {
        throw new PermitLinkError(
          400,
          `Нет решения по требованию «${missing[0].title}» — решите по каждому активному требованию позиции`,
        )
      }
      const unknown = decisions.find((d) => !activeReqs.some((r) => r.id === d.requirementId))
      if (unknown) {
        throw new PermitLinkError(400, 'Решение относится к требованию не из этой позиции')
      }
    } else if (decisions.length > 0) {
      throw new PermitLinkError(400, 'У позиции нет активных требований — решения не требуются')
    }

    // Заморожена ли позиция (строка оценки удалена — пересмотр по факту,
    // созданные требования получают pending_manual, §5.7 п. 0а).
    const actualItems = await currentEstimateItems(mtx, deal)
    const frozen = check.reviewItemId
      ? !actualItems.some((i) => i.id === check.reviewItemId)
      : false

    const outcome: string =
      decisions.length > 0 ? outcomeFromDecisions(decisions) : (input.outcome as string)
    const newCode = check.hsCode

    let createdAny = false
    for (const d of decisions) {
      if (d.action === 'keep') continue
      const row = activeReqs.find((r) => r.id === d.requirementId)!
      // Снятие (waive/replace): причина обязательна (схема проверила).
      await mtx.permitRequirement.update({
        where: { id: row.id },
        data: {
          status: 'waived',
          waivedReason: d.reason?.trim() || `Код изменён на ${newCode}`,
          lastRemindedAt: null,
        },
      })
      await emitEvent(mtx, {
        target: deal,
        actor,
        type: 'permit_waived',
        description: `Разрешительный документ «${row.title}» снят при пересмотре (код изменён на ${newCode}): ${d.reason?.trim() ?? 'причина указана'}`,
      })
      if (d.action === 'replace') {
        if (!d.replacement) {
          throw new PermitLinkError(400, `Для замены «${row.title}» заполните новое требование`)
        }
        const req = d.replacement
        const requirement = await mtx.permitRequirement.create({
          data: {
            ...dealWhereOf(deal),
            title: req.title.trim(),
            providedBy: req.providedBy,
            isBlocking: req.isBlocking ?? false,
            neededBy: req.neededBy ? new Date(`${req.neededBy}T00:00:00.000Z`) : null,
            stageCode: req.stageCode ?? null,
            // Связь с позицией: та же (пересмотр по месту); замороженная
            // позиция — pending_manual (область не расширяется, §5.7 п. 0а).
            itemId: row.itemId,
            source: 'manual',
            createdByType: actor.type,
            createdById: actor.id,
            createdByName: actor.name,
            createdByUserName: actor.name,
            createdByCompanyName: null,
            bindingState: frozen ? 'pending_manual' : 'bound',
          },
          select: { id: true },
        })
        await mtx.permitCheckRequirement.create({
          data: { permitCheckId: check.id, permitRequirementId: requirement.id },
        })
        await emitEvent(mtx, {
          target: deal,
          actor,
          type: 'permit_added',
          description: `Разрешительный документ «${req.title.trim()}» — создать по коду ${newCode} (замена «${row.title}» при пересмотре)${frozen ? ' — связь с позицией требует ручного подтверждения' : ''}`,
        })
        createdAny = true
      }
    }

    // Краткая форма (одно активное требование): new_requirement создаёт
    // требование из input.requirement; not_required — все сняты.
    if (!decisions.length && activeReqs.length === 1 && (input.outcome === 'new_requirement' || input.outcome === 'requirement_waived')) {
      const row = activeReqs[0]
      if (input.outcome === 'requirement_waived') {
        await mtx.permitRequirement.update({
          where: { id: row.id },
          data: {
            status: 'waived',
            waivedReason: input.reason?.trim() || `Код изменён на ${newCode}`,
            lastRemindedAt: null,
          },
        })
        await emitEvent(mtx, {
          target: deal,
          actor,
          type: 'permit_waived',
          description: `Разрешительный документ «${row.title}» снят при пересмотре (код изменён на ${newCode}): ${input.reason?.trim() ?? 'причина указана'}`,
        })
      }
    }
    if (!decisions.length && input.outcome === 'new_requirement' && input.requirement) {
      const req = input.requirement
      const requirement = await mtx.permitRequirement.create({
        data: {
          ...dealWhereOf(deal),
          title: req.title.trim(),
          providedBy: req.providedBy,
          isBlocking: req.isBlocking ?? false,
          neededBy: req.neededBy ? new Date(`${req.neededBy}T00:00:00.000Z`) : null,
          stageCode: req.stageCode ?? null,
          itemId: check.reviewItemId,
          source: 'manual',
          createdByType: actor.type,
          createdById: actor.id,
          createdByName: actor.name,
          createdByUserName: actor.name,
          createdByCompanyName: null,
          bindingState: frozen ? 'pending_manual' : 'bound',
        },
        select: { id: true },
      })
      await mtx.permitCheckRequirement.create({
        data: { permitCheckId: check.id, permitRequirementId: requirement.id },
      })
      await emitEvent(mtx, {
        target: deal,
        actor,
        type: 'permit_added',
        description: `Разрешительный документ «${req.title.trim()}» — создать по коду ${newCode} (пересмотр)${frozen ? ' — связь с позицией требует ручного подтверждения' : ''}`,
      })
      createdAny = true
    }
    if (input.outcome === 'not_required') {
      // Все требования позиции сняты с основанием «не требуется по коду»
      // (§5.7 п. 3а) — без явных decisions это краткая форма для пустой
      // позиции; с decisions снятие уже выполнено выше.
      for (const row of activeReqs) {
        const alreadyWaived = await mtx.permitRequirement.findUnique({
          where: { id: row.id },
          select: { status: true },
        })
        if (alreadyWaived?.status !== 'waived') {
          await mtx.permitRequirement.update({
            where: { id: row.id },
            data: {
              status: 'waived',
              waivedReason: input.reason?.trim() || `Не требуется по коду ${newCode}`,
              lastRemindedAt: null,
            },
          })
          await emitEvent(mtx, {
            target: deal,
            actor,
            type: 'permit_waived',
            description: `Разрешительный документ «${row.title}» снят — не требуется по коду ${newCode}`,
          })
        }
      }
    }

    // Итог проверки нового кода — по исходу пересмотра (см. отчёт гейта):
    // kept/new/mixed → 'required' (требование действует для нового кода);
    // waived/not_required → 'not_required'; unclear_confirmed → 'unclear'.
    const resultByOutcome: Record<string, PermitCheckResult> = {
      requirement_kept: 'required',
      new_requirement: 'required',
      mixed: 'required',
      requirement_waived: 'not_required',
      not_required: 'not_required',
      unclear_confirmed: 'unclear',
    }
    const finalOutcome = createdAny && input.outcome === 'new_requirement' ? 'new_requirement' : outcome
    const updated = await mtx.permitCheck.update({
      where: { id: check.id },
      data: {
        result: resultByOutcome[finalOutcome] ?? check.result as PermitCheckResult,
        basis: input.reason?.trim() || check.basis,
        reviewStatus: 'reviewed',
        reviewedAt: new Date(),
        reviewedByUserName: actor.name,
        reviewedByCompanyName: null,
        reviewOutcome: finalOutcome,
      },
      select: PERMIT_CHECK_FIELDS,
    })
    await emitEvent(mtx, {
      target: deal,
      actor,
      type: 'permit_check_reviewed',
      description: `Пересмотр по коду ТН ВЭД завершён (${PERMIT_CHECK_REVIEW_OUTCOME_LABELS[finalOutcome as keyof typeof PERMIT_CHECK_REVIEW_OUTCOME_LABELS] ?? finalOutcome}): ${actor.name}${input.reason?.trim() ? ` — ${input.reason.trim()}` : ''}`,
    })
    return updated
  })
}

// ─── Список проверок сделки (GET, §11.2) ─────────────────────────────
export async function listPermitChecks(
  deal: DocumentDealTarget
): Promise<(PermitCheckRow & { items: string[] })[]> {
  const rows = await db.permitCheck.findMany({
    where: dealWhereOf(deal),
    select: { ...PERMIT_CHECK_FIELDS, items: { select: { itemId: true } } },
    orderBy: { createdAt: 'desc' },
  })
  return rows.map((r) => ({ ...r, items: r.items.map((i) => i.itemId) }))
}

// Метка результата для UI/событий (перенос чистой подписи).
export function checkResultLabel(result: string): string {
  return PERMIT_CHECK_RESULT_LABELS[result as keyof typeof PERMIT_CHECK_RESULT_LABELS] ?? result
}

// ─── Появление/изменение кода на заявке (§5.2, триггер «поле hsCode») ──
// Отдельной транзакцией с advisory-блокировкой: PATCH заявки вне $transaction,
// контракт роута не трогаем (гард IC-09: файл остаётся ≤ 300 строк).
export async function ensureDealHsCodeCheck(
  orderId: string,
  nextHsCode: string | null | undefined,
  prevHsCode: string | null,
  actor: { type: 'employee'; id: string; name: string },
): Promise<void> {
  if (!nextHsCode || nextHsCode === prevHsCode) return
  const { db } = await import('@/lib/db')
  await db.$transaction(async (mtx) => {
    await lockDeal(mtx, { orderId })
    await ensureAutoPermitCheck(mtx, { deal: { orderId }, hsCode: nextHsCode, actor })
  })
}
