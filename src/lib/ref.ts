import { z } from 'zod'

// ─── DF-17: платформа справочников (D37, O-10) ──────────────────────
// Клиентски-безопасный слой: whitelist dir, типы, zod-схемы и ЧИСТАЯ
// логика поиска (без db — её импортируют API-роуты, формы и тесты).
// Серверное чтение справочника — lib/ref-db.ts; разбор курсов ЦБ —
// lib/cbr.ts; правила Инкотермс как данные — meta записи (сид —
// scripts/ref-data/incoterms.ts).
//
// IC-16: перечней стран/валют/упаковки/условий поставки литералами в
// коде нет — единственный источник выбора это справочник в БД (кроме
// запасного списка валют money.ts на случай пустой таблицы, карточка
// DF-17). Источники данных и условия использования —
// docs/REFERENCES-SOURCES.md.

// dir-ы справочника — закрытый список: каждый dir = отдельный источник
// (таблица справочника одна, происхождение данных — по dir).
export const REF_DIRS = ['country', 'currency', 'packaging', 'incoterm'] as const
export type RefDir = (typeof REF_DIRS)[number]

export const REF_DIR_LABELS: Record<RefDir, string> = {
  country: 'Страны',
  currency: 'Валюты',
  packaging: 'Упаковка',
  incoterm: 'Условия поставки',
}

export function isRefDir(v: unknown): v is RefDir {
  return typeof v === 'string' && (REF_DIRS as readonly string[]).includes(v)
}

// Нормализация кода при записи/поиске: страны и валюты — ISO верхний
// регистр; упаковка (Рек. 21) и Инкотермс — буквенные коды источника.
export function normalizeRefCode(dir: RefDir, code: string): string {
  return code.trim().toUpperCase()
}

// ─── zod-схемы полей-кодов (тела POST/PATCH) ────────────────────────
// null = очистить поле, undefined = не трогать (семантика PATCH).
// Существование и активность кода проверяет API через ref-db (живой
// lookup: справочник живёт короче сделок — проверка на момент действия).

export function refCodeField(label: string) {
  return z
    .string()
    .trim()
    .max(10, `${label} — слишком длинный код`)
    .regex(/^[A-Za-z0-9-]+$/, `${label} — код без пробелов`)
    .transform((v) => v.toUpperCase())
    .nullable()
    .optional()
}

export const currencyCodeSchema = z
  .string()
  .trim()
  .length(3, 'Валюта — трёхбуквенный код ISO 4217')
  .transform((v) => v.toUpperCase())

// ─── Поиск по справочнику (чистая функция — unit-тесты) ─────────────
export type RefOption = {
  code: string
  name: string
  nameEn: string | null
}

// Регистронезависимо: «кит» находит Китай; «CN»/«cn» — по коду;
// латиницей — по nameEn («China»). Префикс кода и вхождение в имя
// считаются совпадением; q пусто/состоит из пробелов — все варианты.
export function matchRefOptions<T extends RefOption>(items: readonly T[], q: string): T[] {
  const needle = q.trim().toLowerCase()
  if (!needle) return [...items]
  return items.filter(
    (it) =>
      it.code.toLowerCase().startsWith(needle) ||
      it.name.toLowerCase().includes(needle) ||
      (it.nameEn ?? '').toLowerCase().includes(needle)
  )
}

// ─── Инкотермс: meta-флаги (данные, не логика — DF-19 считает) ──────
// Правила таможенной стоимости — ЧЕРНОВИК до утверждения брокером
// (O-12): расчёт на них не включает, экран справочника показывает
// с пометкой. Тексты ICC не копируются (авторское право) — только
// названия терминов и собственные формулировки.
export type IncotermMeta = {
  explanation: string
  transport: string[]
  placeKind: 'origin' | 'port_dispatch' | 'border' | 'port_arrival' | 'destination'
  addFreightToArrival?: boolean
  addInsurance?: boolean
  deductPostArrival?: boolean
  warning?: string
  draft?: boolean
}

export function incotermMetaOf(meta: unknown): IncotermMeta | null {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return null
  const m = meta as Record<string, unknown>
  if (typeof m.explanation !== 'string' || !Array.isArray(m.transport)) return null
  const kinds = ['origin', 'port_dispatch', 'border', 'port_arrival', 'destination']
  const placeKind = typeof m.placeKind === 'string' && kinds.includes(m.placeKind)
    ? (m.placeKind as IncotermMeta['placeKind'])
    : null
  if (!placeKind) return null
  return {
    explanation: m.explanation,
    transport: m.transport.filter((t): t is string => typeof t === 'string'),
    placeKind,
    addFreightToArrival: m.addFreightToArrival === true,
    addInsurance: m.addInsurance === true,
    deductPostArrival: m.deductPostArrival === true,
    warning: typeof m.warning === 'string' ? m.warning : undefined,
    draft: m.draft !== false,
  }
}

export const PLACE_KIND_LABELS: Record<IncotermMeta['placeKind'], string> = {
  origin: 'место на стороне отправителя',
  port_dispatch: 'порт отправления',
  border: 'граница',
  port_arrival: 'порт прибытия',
  destination: 'место на стороне получателя',
}

export const INCOTERM_TRANSPORT_LABELS: Record<string, string> = {
  any: 'любой транспорт',
  sea: 'морской и внутренний водный',
}
