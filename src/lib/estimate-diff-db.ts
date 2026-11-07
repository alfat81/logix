import { Prisma } from '@prisma/client'
import { brokerActor } from '@/lib/activity'
import {
  currentEstimateItems,
  handleHsCodeChange,
  lockDeal,
  syncAfterEstimateDiff,
} from '@/lib/permit-checks-db'

// ─── DF-26 волна 2: дифф-сохранение строк оценки брокера (§5.7 п. 0а) ──
// Идентичность позиции — id строки: с id — обновление НА МЕСТЕ (связи
// PermitRequirement.itemId / PermitCheckItem остаются валидными без
// всякого сопоставления), без id — создание, отсутствующие в payload —
// удаление (требования удалённых строк → pending_manual с замороженной
// ссылкой). Сопоставления «старая ↔ новая» НЕТ — равное число позиций,
// sortOrder и совпадение ставок идентичность не доказывают (замечание
// владельца, ред. 1.6). Смена кода сохранённой строки — пересмотр по
// месту (§5.7 п. 0/2). Всё — в транзакции вызывающего с advisory-
// блокировкой сделки; remapPermitItemIds упразднён (заменён диффом).

export type EstimateDiffItem = {
  id?: string
  hsCode: string
  dutyPercent?: number | null
  addDutyPercent?: number | null
  addDutyNote?: string | null
  vatPercent?: number | null
  rateNote?: string | null
}

export type EstimateDiffActor = ReturnType<typeof brokerActor> | { type: 'system' }

/** Ошибка контракта диффа (D35): Error с statusCode 4xx —
 * apiErrorResponse роута маппит её в честный код и сообщение. */
export class EstimateDiffError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message)
    this.statusCode = statusCode
  }
}

export async function saveEstimateItemsDiff(
  tx: Prisma.TransactionClient,
  input: {
    estimateId: string
    deal: { orderId: string } | { leadId: string }
    actor: EstimateDiffActor
    items: EstimateDiffItem[]
    // Верифицированные сервером коды (справочник DF-17C) — для isManualCode.
    knownCodes: Set<string>
    oldItems: { id: string; hsCode: string }[]
  }
): Promise<void> {
  const { items, knownCodes, oldItems } = input

  const oldById = new Map(oldItems.map((i) => [i.id, i]))

  const payloadIds = items.filter((i) => i.id).map((i) => i.id as string)
  if (new Set(payloadIds).size !== payloadIds.length) {
    throw new EstimateDiffError(400, 'Дубль id строки в запросе — каждая строка встречается один раз')
  }
  for (const pid of payloadIds) {
    if (!oldById.has(pid)) {
      throw new EstimateDiffError(
        400,
        'Строка с id не принадлежит этой оценке — обновляются только существующие строки',
      )
    }
  }
  const payloadIdSet = new Set(payloadIds)
  const removedIds = oldItems.filter((i) => !payloadIdSet.has(i.id)).map((i) => i.id)

  if (removedIds.length > 0) {
    await tx.brokerEstimateItem.deleteMany({ where: { id: { in: removedIds } } })
  }
  for (const [idx, item] of items.entries()) {
    if (item.id) {
      // Обновление на месте: id и createdAt строки не меняются.
      await tx.brokerEstimateItem.update({
        where: { id: item.id },
        data: {
          sortOrder: idx,
          hsCode: item.hsCode,
          isManualCode: !knownCodes.has(item.hsCode),
          dutyPercent: item.dutyPercent ?? null,
          addDutyPercent: item.addDutyPercent ?? null,
          addDutyNote: item.addDutyNote ?? null,
          vatPercent: item.vatPercent ?? null,
          rateNote: item.rateNote ?? null,
        },
      })
    }
  }
  const creates = items.filter((i) => !i.id)
  if (creates.length > 0) {
    await tx.brokerEstimateItem.createMany({
      data: creates.map((item) => ({
        estimateId: input.estimateId,
        sortOrder: items.indexOf(item),
        hsCode: item.hsCode,
        isManualCode: !knownCodes.has(item.hsCode),
        dutyPercent: item.dutyPercent ?? null,
        addDutyPercent: item.addDutyPercent ?? null,
        addDutyNote: item.addDutyNote ?? null,
        vatPercent: item.vatPercent ?? null,
        rateNote: item.rateNote ?? null,
      })),
    })
  }

  // Смена кода сохранённой строки — пересмотр по месту (§5.7 п. 0/2):
  // событие на каждую смену; потребность пересмотра — открытая
  // needs_review-запись позиции (п. 2а — повторная смена обновляет).
  for (const item of items) {
    if (!item.id) continue
    const old = oldById.get(item.id)
    if (old && old.hsCode !== item.hsCode) {
      await handleHsCodeChange(tx, {
        deal: input.deal,
        itemId: item.id,
        oldCode: old.hsCode,
        newCode: item.hsCode,
        actor: input.actor,
      })
    }
  }

  // Синхронизация контура проверок в той же транзакции: удалённые
  // строки — требования в pending_manual + события; охват открытых
  // auto-записей — по актуальным строкам кода; новый код — auto-запись
  // + permit_check_needed (§5.2); опустевшие записи гасятся.
  const afterItems = await currentEstimateItems(tx, input.deal)
  const addedItemIds = afterItems.filter((i) => !oldById.has(i.id)).map((i) => i.id)
  await syncAfterEstimateDiff(tx, {
    deal: input.deal,
    actor: input.actor,
    removedItemIds: removedIds,
    addedItemIds,
  })
}

export { lockDeal }
