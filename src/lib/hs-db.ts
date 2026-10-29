import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import {
  escapeHsLike,
  isHsCodeQuery,
  hsPrefixRange,
  normalizeHsQuery,
} from '@/lib/hs'

// ─── DF-17C: серверный поиск ТН ВЭД ──────────────────────────────────
// Единственная точка чтения HsCode для API и форм (RULES 2.15 — одно
// место знания). Публичный /api/hs/search отдаёт позиции всем
// авторизованным кабинетам (брокер и менеджер выбирают код, DF-17C/18;
// клиент код не выбирает и Combobox не видит — карточка DF-17C).
//
// Активные записи — только текущей редакции: validTo IS NULL (импорт
// новой редакции закрывает предыдущую). Старые сделки живут снимками
// кода и редакции — по журналам HsImport/HsCode окно действия
// восстанавливается (isHsValidOn), истории удаления нет (карточка:
// «без удаления старого»).

export const HS_SEARCH_LIMIT_MAX = 50
export const HS_SEARCH_LIMIT_DEFAULT = 20

export type HsSearchItem = {
  code: string
  name: string
  etdDutyText: string | null
}

export type HsSearchResult = {
  rev: string | null
  items: HsSearchItem[]
}

// Поиск: цифровой запрос — префикс кода (btree-диапазон), иначе —
// вхождение в наименование (ILIKE, спецсимволы экранируются).
// Пустой запрос — первые позиции кода (для «посмотреть справочник»).
export async function searchHsCodes(
  q: string,
  opts: { limit?: number } = {}
): Promise<HsSearchResult> {
  const limit = Math.min(
    Math.max(opts.limit ?? HS_SEARCH_LIMIT_DEFAULT, 1),
    HS_SEARCH_LIMIT_MAX
  )
  const normalized = normalizeHsQuery(q)
  // Только текущая редакция (validTo IS NULL); старые редакции остаются
  // в истории (validFrom/validTo) — их отдаёт только явный запрос по rev.
  const where: Prisma.HsCodeWhereInput = isHsCodeQuery(normalized)
    ? (() => {
        const { gte, lt } = hsPrefixRange(normalized)
        // Префиксный поиск: диапазон [gte, lt) отсекает выход за префикс
        // (перенос через девятки — hsPrefixRange). Край all-9s: lt нет —
        // берём startswith.
        return lt
          ? { validTo: null, code: { gte, lt } }
          : { validTo: null, code: { startsWith: gte } }
      })()
    : {
        validTo: null,
        // Пустой q → вхождение пустой строки (все позиции); спецсимволы
        // LIKE экранируются (escapeHsLike), регистр не важен.
        name: { contains: escapeHsLike(normalized), mode: 'insensitive' },
      }

  const [rows, latest] = await Promise.all([
    db.hsCode.findMany({
      where,
      orderBy: [{ code: 'asc' }],
      select: { code: true, name: true, etdDutyText: true },
      take: limit,
    }),
    db.hsImport.findFirst({ orderBy: [{ importedAt: 'desc' }], select: { version: true } }),
  ])

  return { rev: latest?.version ?? null, items: rows }
}
