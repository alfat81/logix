// ─── DF-17C: справочник ТН ВЭД — чистые функции ─────────────────────
// Без импортов (только типы): файл импортируется и из приложения
// (hs-db.ts, API, тесты), и из скрипта импорта scripts/import-hs.ts,
// который живёт вне компиляции Next (см. комментарий в seed.ts про
// хрупкость алиасов) — поэтому путь относительный и зависимостей нет.
//
// Карточка DF-17C: поиск по коду (префикс, с пробелами и без) и по
// названию; версии (код действовал на дату); импорт повторно не
// дублирует. Schema: HsCode (code 10, name, level, unit, etdDutyText,
// validFrom, validTo, sourceRev) + HsImport (version, источник, число
// позиций). Данные — scripts/ref-data/hs/tnved-tws.json (открытая
// выгрузка tws.by, см. docs/REFERENCES-SOURCES.md, раздел hs).

// Нормализация запроса: пробелы/дефисы/точки выкидываются («0101 21» и
// «010121» — одно и то же), остальные символы сохраняются (поиск по
// названию идёт как есть).
export function normalizeHsQuery(q: string): string {
  return q.replace(/[\s.\-/]+/g, '').trim()
}

// Цифровой запрос → поиск по префиксу кода; есть буквы → по названию.
export function isHsCodeQuery(q: string): boolean {
  const n = normalizeHsQuery(q)
  return n !== '' && /^\d+$/.test(n)
}

// Границы префиксного поиска по индексу (btree): code >= gte AND
// code < lt. «0101» → [0101, 0102); полный код «0101210000» →
// [0101210000, 0101210001); «0199» → [0199, 0200) — числовой перенос
// через все девятки, иначе в диапазон попадают чужие коды («0200…»).
// Все девятки («9999») — верхняя граница недостижима, lt = null.
export function hsPrefixRange(prefix: string): { gte: string; lt: string | null } {
  const p = normalizeHsQuery(prefix)
  if (p === '' || !/^\d+$/.test(p)) return { gte: p, lt: p }
  const digits = p.split('')
  for (let i = digits.length - 1; i >= 0; i--) {
    if (digits[i] !== '9') {
      digits[i] = String(Number(digits[i]) + 1)
      return { gte: p, lt: digits.join('') }
    }
    digits[i] = '0'
  }
  // Все девятки: префикс — максимум, верхней границы нет
  return { gte: p, lt: null }
}

// Дата → 'YYYY-MM-DD' (сравнение по календарю, не по часовым поясам:
// validFrom/validTo — @db.Date, время роли не играет).
function dayKey(d: Date | string): string {
  if (typeof d === 'string') return d.slice(0, 10)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// «Код действовал на дату»: validFrom <= date < validTo (или бессрочно).
export function isHsValidOn(
  row: { validFrom: Date | string; validTo: Date | string | null },
  date: Date | string
): boolean {
  const d = dayKey(date)
  return dayKey(row.validFrom) <= d && (row.validTo === null || dayKey(row.validTo) > d)
}

// Фильтр по названию (регистр не важен). В БД то же самое делает
// contains + mode:'insensitive' со спецсимволами LIKE (hs-db.ts);
// эта версия — для тестов и локальной фильтрации малых списков.
export function matchHsName<T extends { name: string }>(rows: T[], q: string): T[] {
  const needle = q.trim().toLowerCase()
  if (needle === '') return rows
  return rows.filter((r) => r.name.toLowerCase().includes(needle))
}

// Экранирование %/_/\ в строке для Prisma contains (LIKE): без этого
// запрос «100%» внезапно совпадёт с чем угодно.
export function escapeHsLike(q: string): string {
  return q.trim().replace(/([%_\\])/g, '\\$1')
}

// Решение импорта по версиям (карточка: «импорт повторно не дублирует»,
// «без удаления старого», история действия):
//  • fresh   — редакции ещё нет: вставить строки, закрыть предыдущую;
//  • same    — редакция уже импортирована: НИЧЕГО не писать (кроме
//              сверки числа позиций в журнале);
//  • older   — попытка импорта старее существующей: ОТКАЗ (защита
//              истории; новая редакция после старой перезаливается
//              только осознанно, вручную).
export function planHsImport(
  knownVersions: string[],
  incoming: string
): 'fresh' | 'same' | 'older' {
  if (knownVersions.includes(incoming)) return 'same'
  const newerExists = knownVersions.some((v) => v > incoming)
  return newerExists ? 'older' : 'fresh'
}
