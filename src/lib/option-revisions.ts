import type { Prisma, QuoteOptionRevision } from '@prisma/client'
import { db } from '@/lib/db'

// ─── DF-27 волна 1: ревизии варианта — история «кем/когда/что» ──────
// (ТЗ §4; план v1.2 §4). Activity-события остаются лентой, но диффы там
// — текст в description: по ним нельзя показать поле-за-поле историю
// конкретного варианта и восстановить порядок правок. Ревизии —
// структурная история: append-only (эндпоинтов правки нет), удаление —
// только каскадом с вариантом/запросом.

export const OPTION_REVISION_KINDS = [
  'created',
  'updated',
  'filled_from_lead',
  'price_review_reset',
] as const

export type OptionRevisionKind = (typeof OPTION_REVISION_KINDS)[number]

export const OPTION_REVISION_KIND_LABELS: Record<OptionRevisionKind, string> = {
  created: 'Вариант создан',
  updated: 'Вариант изменён',
  filled_from_lead: 'Заполнен из запроса',
  price_review_reset: 'Пересмотр цены выполнен',
}

export type RevisionActor = { type: string; id: string | null; name: string }

type ChangedField = { from: unknown; to: unknown }

// Стабильная сериализация: ключи объектов (рекурсивно) — по алфавиту,
// порядок ключей в Json не считается изменением состава (приходят из
// разных источников: существующая строка vs строка после UPDATE)
function stableValue(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(stableValue)
  if (v && typeof v === 'object') {
    const src = v as Record<string, unknown>
    const out: Record<string, unknown> = {}
    for (const k of Object.keys(src).sort()) out[k] = stableValue(src[k])
    return out
  }
  return v
}

// Дифф по верхнеуровневым ключам: {ключ: {from, to}} — только реально
// изменившиеся (JSON-сравнение со стабильной сериализацией; undefined
// с обеих сторон — «не трогали»). Ключи-агрегаты (например, строки
// расчёта) вызывающая сторона кладёт сама — {from, to} произвольного
// содержания.
export function buildChangedFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>
): Record<string, ChangedField> {
  const out: Record<string, ChangedField> = {}
  const keys = new Set([...Object.keys(before), ...Object.keys(after)])
  for (const k of keys) {
    const a = before[k] ?? null
    const b = after[k] ?? null
    if (JSON.stringify(stableValue(a)) !== JSON.stringify(stableValue(b))) {
      out[k] = { from: a, to: b }
    }
  }
  return out
}

type RevisionTx = Prisma.TransactionClient | typeof db

// Запись ревизии ВНУТРИ транзакции операции (создание/правка/заполнение
// варианта): seq = max+1 внутри варианта (уникальность @@unique
// [optionId, seq] защищает от гонок двух правок одного варианта —
// вторая транзакция упадёт по unique и повторится вызывающим роутом).
export async function recordOptionRevision(
  tx: RevisionTx,
  input: {
    optionId: string
    kind: OptionRevisionKind
    actor: RevisionActor
    changedFields?: Record<string, ChangedField>
  }
): Promise<QuoteOptionRevision> {
  const agg = await tx.quoteOptionRevision.aggregate({
    where: { optionId: input.optionId },
    _max: { seq: true },
  })
  const seq = (agg._max.seq ?? 0) + 1
  return tx.quoteOptionRevision.create({
    data: {
      optionId: input.optionId,
      seq,
      kind: input.kind,
      actorType: input.actor.type,
      actorId: input.actor.id,
      actorName: input.actor.name,
      ...(input.changedFields && Object.keys(input.changedFields).length > 0
        ? { changedFields: input.changedFields as unknown as Prisma.InputJsonObject }
        : {}),
    },
  })
}

// Человекочитаемое перечисление изменений для события option_updated
// (лента — «Ключ: старое → новое», прецедент buildLeadEditDiff)
export function changedFieldsSummary(changed: Record<string, ChangedField>): string {
  return Object.entries(changed)
    .map(([key, { from, to }]) => {
      const fmt = (v: unknown): string => {
        if (v === null || v === undefined) return '—'
        if (typeof v === 'object') return JSON.stringify(v)
        return String(v)
      }
      return `${key}: ${fmt(from)} → ${fmt(to)}`
    })
    .join('; ')
}
