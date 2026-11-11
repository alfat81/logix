import { joinRouteText } from '@/lib/route-fields'
import type { RouteFieldsInput } from '@/lib/route-fields'
import { sumOptionCalc, type MoneyValue, type OptionCalcTotals } from '@/lib/option-calc'

// ─── DF-27 волна 1: снимки бланка запроса, provenance, полнота ──────
// (ТЗ §3–§5; план v1.2 §3–§4, §6). Файл БЕЗ серверных зависимостей:
// его импортируют API-роуты вариантов, GET-проекции и unit-тесты.
//
// Источник копирования — всегда исходный запрос (Lead), никогда —
// предыдущий вариант (ТЗ §3.5). Снимки хранят бланк verbatim: известные
// ключи формы И все произвольные ключи cargoInfo — ничего не теряется
// независимо от эволюции бланка (правка №4 — полный состав анкеты).
// Читатели снимков — толерантные (прецедент quote-snapshot.ts).

// Маркер версии структур снимков (толерантные читатели проверяют
// мягко: незнакомая версия/ключи читаются без падений)
export const OPTION_SNAPSHOT_VERSION = 1

// Ключи маршрутного снимка — все маршрутные колонки запроса и условия
// поставки (план v1.2 §3)
export const ROUTE_SNAPSHOT_KEYS = [
  'originCity',
  'originCountry',
  'originCountryCode',
  'destinationCity',
  'destinationCountry',
  'destinationCountryCode',
  'transportType',
  'readyDate',
  'incotermCode',
  'incotermPlace',
] as const
export type RouteSnapshotKey = (typeof ROUTE_SNAPSHOT_KEYS)[number]

export type RouteSnapshot = { v: number } & Record<RouteSnapshotKey, string | null>

export type CargoSnapshot = {
  v: number
  // Грузовой бланк запроса целиком (известные ключи формы + произвольные)
  cargo: Record<string, unknown>
  // «Пожелания к перевозке» — волна 2 (до этого null; пожелания
  // варианта — через overrides POST/PATCH)
  wishes: string | null
}

export type OptionSnapshots = {
  routeSnapshot: RouteSnapshot
  cargoSnapshot: CargoSnapshot
  // Provenance: ключи, скопированные из запроса (плоский namespace:
  // 'route.<ключ>' | 'cargo.<ключ>' | 'wishes' | 'routeStops')
  sourceFields: string[]
}

// Исходный бланк запроса для сборки снимков (строка Lead: колонки
// P1-03/DF-17/DF-19 + cargoInfo; wishes — колонка с волны 2)
export type LeadBlankRow = {
  originCity?: unknown
  originCountry?: unknown
  originCountryCode?: unknown
  destinationCity?: unknown
  destinationCountry?: unknown
  destinationCountryCode?: unknown
  transportType?: unknown
  readyDate?: unknown
  incotermCode?: unknown
  incotermPlace?: unknown
  cargoInfo?: unknown
  wishes?: unknown
}

// Дата: Date/ISO-строка → yyyy-mm-dd (календарные даты бланка — без
// таймзонного сдвига; правило Ж5/P1-06)
function toIsoDate(v: unknown): string | null {
  if (v instanceof Date) {
    return Number.isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10)
  }
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v.trim())) {
    return v.trim().slice(0, 10)
  }
  return null
}

function strOrNull(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

// Маршрутный снимок — из колонок запроса (P1-03/DF-17/DF-19)
export function buildRouteSnapshot(lead: LeadBlankRow): RouteSnapshot {
  return {
    v: OPTION_SNAPSHOT_VERSION,
    originCity: strOrNull(lead.originCity),
    originCountry: strOrNull(lead.originCountry),
    originCountryCode: strOrNull(lead.originCountryCode),
    destinationCity: strOrNull(lead.destinationCity),
    destinationCountry: strOrNull(lead.destinationCountry),
    destinationCountryCode: strOrNull(lead.destinationCountryCode),
    transportType: strOrNull(lead.transportType),
    readyDate: toIsoDate(lead.readyDate),
    incotermCode: strOrNull(lead.incotermCode),
    incotermPlace: strOrNull(lead.incotermPlace),
  }
}

function cargoObject(cargoInfo: unknown): Record<string, unknown> {
  return cargoInfo && typeof cargoInfo === 'object' && !Array.isArray(cargoInfo)
    ? { ...(cargoInfo as Record<string, unknown>) }
    : {}
}

// Грузовой снимок — cargoInfo запроса verbatim + пожелания
// (wishes запроса; у варианта переопределяется overrides-ом)
export function buildCargoSnapshot(lead: LeadBlankRow): CargoSnapshot {
  return {
    v: OPTION_SNAPSHOT_VERSION,
    cargo: cargoObject(lead.cargoInfo),
    wishes: strOrNull(lead.wishes),
  }
}

// Единая серверная точка сборки снимков (ТЗ §3.5): base-состав
// «как в запросе» — весь бланк, sourceFields = все скопированные ключи
export function buildOptionSnapshots(lead: LeadBlankRow): OptionSnapshots {
  const routeSnapshot = buildRouteSnapshot(lead)
  const cargoSnapshot = buildCargoSnapshot(lead)
  const sourceFields = [
    ...ROUTE_SNAPSHOT_KEYS.map((k) => `route.${k}`),
    ...Object.keys(cargoSnapshot.cargo).map((k) => `cargo.${k}`),
  ]
  if (cargoSnapshot.wishes !== null) sourceFields.push('wishes')
  return { routeSnapshot, cargoSnapshot, sourceFields }
}

// ─── Подписи provenance-ключей (UI: «из запроса» / «изменено») ─────
export const PROVENANCE_LABELS: Record<string, string> = {
  'route.originCity': 'Пункт отправления',
  'route.originCountry': 'Страна отправления',
  'route.originCountryCode': 'Страна отправления',
  'route.destinationCity': 'Пункт прибытия',
  'route.destinationCountry': 'Страна прибытия',
  'route.destinationCountryCode': 'Страна прибытия',
  'route.transportType': 'Тип перевозки',
  'route.readyDate': 'Дата готовности груза',
  'route.incotermCode': 'Условия поставки',
  'route.incotermPlace': 'Место поставки',
  'routeStops': 'Промежуточные точки',
  'wishes': 'Пожелания к перевозке',
  'cargo.cargoName': 'Наименование груза',
  'cargo.hsCode': 'Код ТН ВЭД',
  'cargo.placesCount': 'Количество мест',
  'cargo.weightKg': 'Вес, кг',
  'cargo.volumeM3': 'Объём, м³',
  'cargo.packaging': 'Тип упаковки',
  'cargo.packagingCode': 'Упаковка (код)',
  'cargo.cargoValue': 'Стоимость груза',
  'cargo.dangerous': 'Опасный груз',
  'cargo.stackable': 'Штабелирование',
  'cargo.tiltable': 'Кантование',
  'cargo.specialRequirements': 'Особые требования',
  'cargo.routeNote': 'Маршрут (подробно)',
  'cargo.shipDate': 'Дата отправления',
  'cargo.shipperName': 'Грузоотправитель',
  'cargo.consigneeName': 'Грузополучатель',
}

export function provenanceLabel(key: string): string {
  return PROVENANCE_LABELS[key] ?? (key.startsWith('cargo.') ? key.slice(6) : key)
}

// ─── Diff «вариант ↔ исходный запрос» (ТЗ §4) ──────────────────────
export type OptionLeadDiffItem = {
  key: string
  label: string
  lead: string | null
  option: string | null
}

type OptionSnapshotRow = {
  routeSnapshot?: unknown
  cargoSnapshot?: unknown
}

// Толерантное чтение снимков: легаси-вариант (null) и чужая структура
// не роняют проекции — расхождение не считается
function readRouteSnapshot(row: OptionSnapshotRow): Partial<RouteSnapshot> | null {
  const v = row.routeSnapshot
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  return v as Partial<RouteSnapshot>
}

function readCargoSnapshot(row: OptionSnapshotRow): CargoSnapshot | null {
  const v = row.cargoSnapshot
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  const s = v as Partial<CargoSnapshot>
  return {
    v: typeof s.v === 'number' ? s.v : 1,
    cargo: cargoObject(s.cargo),
    wishes: strOrNull(s.wishes),
  }
}

// Нормализация значения для сравнения/показа: даты — yyyy-mm-dd,
// числа — без хвостовых нулей, остальное — строка
function displayValue(v: unknown): string | null {
  if (v === null || v === undefined) return null
  if (v instanceof Date) return toIsoDate(v)
  if (typeof v === 'boolean') return v ? 'Да' : 'Нет'
  if (typeof v === 'number') return String(v)
  if (
    typeof v === 'object' &&
    typeof (v as { toNumber?: unknown }).toNumber === 'function'
  ) {
    const n = (v as unknown as { toNumber: () => number }).toNumber()
    return Number.isFinite(n) ? String(n) : null
  }
  const s = String(v).trim()
  return s || null
}

function sameValue(a: unknown, b: unknown): boolean {
  const da = displayValue(a)
  const db = displayValue(b)
  if (da === null && db === null) return true
  if (da === null || db === null) return false
  const na = Number(da.replace(',', '.'))
  const nb = Number(db.replace(',', '.'))
  if (Number.isFinite(na) && Number.isFinite(nb)) return na === nb
  return da === db
}

// Расхождения варианта со снимками против текущего запроса — по
// известным ключам маршрута и груза (ТЗ §4 «чем вариант отличается
// от запроса»). Легаси-вариант (без снимков) → null (сравнивать
// нечего — «данные как в запросе» по построению).
export function diffOptionVsLead(
  lead: LeadBlankRow,
  option: OptionSnapshotRow
): OptionLeadDiffItem[] | null {
  const route = readRouteSnapshot(option)
  const cargo = readCargoSnapshot(option)
  if (!route && !cargo) return null
  const out: OptionLeadDiffItem[] = []
  if (route) {
    for (const k of ROUTE_SNAPSHOT_KEYS) {
      const optVal = (route as Record<string, unknown>)[k]
      const leadVal =
        k === 'readyDate'
          ? toIsoDate(lead.readyDate)
          : k === 'incotermCode' || k === 'incotermPlace'
            ? (lead as Record<string, unknown>)[k]
            : (lead as Record<string, unknown>)[k]
      if (!sameValue(optVal, leadVal)) {
        out.push({
          key: `route.${k}`,
          label: provenanceLabel(`route.${k}`),
          lead: displayValue(leadVal),
          option: displayValue(optVal),
        })
      }
    }
  }
  if (cargo) {
    const leadCargo = cargoObject(lead.cargoInfo)
    for (const [k, optVal] of Object.entries(cargo.cargo)) {
      if (!(k in leadCargo)) continue
      if (!sameValue(optVal, leadCargo[k])) {
        out.push({
          key: `cargo.${k}`,
          label: provenanceLabel(`cargo.${k}`),
          lead: displayValue(leadCargo[k]),
          option: displayValue(optVal),
        })
      }
    }
    if (!sameValue(cargo.wishes ?? null, strOrNull(lead.wishes))) {
      out.push({
        key: 'wishes',
        label: provenanceLabel('wishes'),
        lead: strOrNull(lead.wishes),
        option: displayValue(cargo.wishes),
      })
    }
  }
  return out
}

// ─── Полнота данных (ТЗ §5.1; план §6.1) ───────────────────────────
// Критичные параметры достоверного расчёта: обе точки маршрута, дата
// готовности груза, вес ИЛИ объём, количество мест, код ТН ВЭД,
// стоимость груза, условия Инкотермс. Значения — из маршрутных колонок
// и cargoInfo; вариант-снимок переопределяет запрос (completeness
// считает эффективный вид «что реально ляжет в расчёт»).
// Примечание: бланк анкеты хранит стоимость груза одной строкой
// (cargoValue) — отдельного ключа валюты стоимости в бланке нет,
// критерий сводится к заполненной стоимости.

export type Completeness = { ready: boolean; missing: string[] }

export type CompletenessRow = LeadBlankRow & { weightKg?: unknown; volumeM3?: unknown; placesCount?: unknown }

type OptionOverrideRow = {
  routeSnapshot?: unknown
  cargoSnapshot?: unknown
}

export function completeness(lead: CompletenessRow, option?: OptionOverrideRow): Completeness {
  const route = option ? readRouteSnapshot(option) : null
  const cargo = option ? readCargoSnapshot(option) : null
  const col = (k: string): unknown =>
    route && k in (route as Record<string, unknown>)
      ? (route as Record<string, unknown>)[k]
      : (lead as Record<string, unknown>)[k]
  const cargoVal = (k: string): unknown =>
    cargo && k in cargo.cargo ? cargo.cargo[k] : cargoObject(lead.cargoInfo)[k]

  const missing: string[] = []
  const originSet =
    strOrNull(col('originCity')) !== null ||
    strOrNull(col('originCountry')) !== null ||
    strOrNull(col('originCountryCode')) !== null
  const destSet =
    strOrNull(col('destinationCity')) !== null ||
    strOrNull(col('destinationCountry')) !== null ||
    strOrNull(col('destinationCountryCode')) !== null
  if (!originSet) missing.push('Пункт отправления')
  if (!destSet) missing.push('Пункт прибытия')
  if (toIsoDate(col('readyDate')) === null) missing.push('Дата готовности груза')
  const weight = Number(displayValue(col('weightKg')) ?? NaN)
  const volume = Number(displayValue(col('volumeM3')) ?? NaN)
  if (!(Number.isFinite(weight) && weight > 0) && !(Number.isFinite(volume) && volume > 0)) {
    missing.push('Вес или объём')
  }
  const places = Number(displayValue(col('placesCount')) ?? NaN)
  if (!(Number.isFinite(places) && places > 0)) missing.push('Количество мест')
  if (strOrNull(cargoVal('hsCode')) === null) missing.push('Код ТН ВЭД')
  const value = Number(displayValue(cargoVal('cargoValue')) ?? NaN)
  if (!(Number.isFinite(value) && value > 0)) missing.push('Стоимость груза')
  if (strOrNull(col('incotermCode')) === null) missing.push('Условия поставки (Инкотермс)')

  return { ready: missing.length === 0, missing }
}

// ─── Ценозначимые изменения запроса (ТЗ §5.5; план §6.5) ───────────
// При правке запроса сервер ставит priceReviewRequired=true всем
// вариантам, если изменились: маршрут, дата готовности, вес/объём/
// места, стоимость груза, опасные свойства, ТН ВЭД, Инкотермс.
export const PRICE_SIGNIFICANT_EVENT_KEYS = [
  'route.origin',
  'route.destination',
  'route.transportType',
  'route.readyDate',
  'route.weightKg',
  'route.volumeM3',
  'route.placesCount',
  'route.incotermCode',
  'cargo.cargoValue',
  'cargo.dangerous',
  'cargo.hsCode',
] as const

const PRICE_SIGNIFICANT_LABELS: Record<(typeof PRICE_SIGNIFICANT_EVENT_KEYS)[number], string> = {
  'route.origin': 'Откуда',
  'route.destination': 'Куда',
  'route.transportType': 'Тип перевозки',
  'route.readyDate': 'Дата готовности',
  'route.weightKg': 'Вес',
  'route.volumeM3': 'Объём',
  'route.placesCount': 'Мест',
  'route.incotermCode': 'Инкотермс',
  'cargo.cargoValue': 'Стоимость груза',
  'cargo.dangerous': 'Опасный груз',
  'cargo.hsCode': 'Код ТН ВЭД',
}

// Детект ценозначимых изменений: existing — строка лида до правки,
// incoming — слитые значения PATCH (route-колонки после resolve,
// mergedCargo после mergeLeadCargo, incotermCode после PATCH-семантики).
export function detectPriceSignificantChanges(
  existing: CompletenessRow,
  incoming: {
    route?: RouteFieldsInput
    mergedCargo?: Record<string, unknown> | null
    incotermCode?: string | null
  }
): string[] {
  const changed: string[] = []
  const next = (k: keyof RouteFieldsInput, cur: unknown): unknown => {
    const r = incoming.route
    if (!r || r[k] === undefined) return cur
    return r[k]
  }
  const push = (key: (typeof PRICE_SIGNIFICANT_EVENT_KEYS)[number], a: unknown, b: unknown): void => {
    if (!sameValue(a, b)) changed.push(PRICE_SIGNIFICANT_LABELS[key])
  }
  push(
    'route.origin',
    joinRouteText(existing.originCountry, existing.originCity),
    joinRouteText(next('originCountry', existing.originCountry), next('originCity', existing.originCity))
  )
  push(
    'route.destination',
    joinRouteText(existing.destinationCountry, existing.destinationCity),
    joinRouteText(
      next('destinationCountry', existing.destinationCountry),
      next('destinationCity', existing.destinationCity)
    )
  )
  push('route.transportType', existing.transportType, next('transportType', existing.transportType))
  push('route.readyDate', toIsoDate(existing.readyDate), toIsoDate(next('readyDate', existing.readyDate)))
  push('route.weightKg', existing.weightKg, next('weightKg', existing.weightKg))
  push('route.volumeM3', existing.volumeM3, next('volumeM3', existing.volumeM3))
  push('route.placesCount', existing.placesCount, next('placesCount', existing.placesCount))
  push(
    'route.incotermCode',
    strOrNull(existing.incotermCode),
    incoming.incotermCode !== undefined ? incoming.incotermCode : strOrNull(existing.incotermCode)
  )
  const oldCargo = cargoObject(existing.cargoInfo)
  const newCargo = incoming.mergedCargo !== undefined ? cargoObject(incoming.mergedCargo) : oldCargo
  for (const k of ['cargoValue', 'dangerous', 'hsCode'] as const) {
    push(`cargo.${k}` as (typeof PRICE_SIGNIFICANT_EVENT_KEYS)[number], oldCargo[k], newCargo[k])
  }
  return changed
}

// ─── Overrides варианта (ТЗ §3.3–3.4; план §4.2) ───────────────────
// POST/PATCH варианта может переопределить любые ключи бланка:
// маршрутные поля, грузовые ключи, промежуточные точки, пожелания.
// Переопределённые ключи уходят в editedFields, остальные остаются
// в sourceFields (пометки «из запроса» / «изменено» в UI).
export type OptionOverrides = {
  route?: Partial<Record<RouteSnapshotKey, unknown>>
  cargo?: Record<string, unknown> | null
  routeStops?: unknown[] | null
  wishes?: string | null
}

export type OverriddenSnapshots = {
  routeSnapshot: RouteSnapshot
  cargoSnapshot: CargoSnapshot
  routeStops: unknown[] | null
  sourceFields: string[]
  editedFields: string[]
}

// Применение overrides к base-снимкам (base = buildOptionSnapshots
// запроса; для легаси-варианта роут строит base из запроса так же).
// null в override = очистить значение (PATCH-семантика лида).
export function applyOverrides(
  base: OptionSnapshots,
  overrides: OptionOverrides
): OverriddenSnapshots {
  const routeSnapshot: RouteSnapshot = { ...base.routeSnapshot }
  const cargoSnapshot: CargoSnapshot = {
    ...base.cargoSnapshot,
    cargo: { ...base.cargoSnapshot.cargo },
  }
  const edited = new Set<string>()

  if (overrides.route) {
    for (const [k, v] of Object.entries(overrides.route)) {
      if (!(ROUTE_SNAPSHOT_KEYS as readonly string[]).includes(k)) continue
      const key = k as RouteSnapshotKey
      routeSnapshot[key] =
        key === 'readyDate' ? toIsoDate(v) : strOrNull(v)
      edited.add(`route.${key}`)
    }
  }
  if (overrides.cargo !== undefined) {
    if (overrides.cargo === null) {
      cargoSnapshot.cargo = {}
    } else {
      for (const [k, v] of Object.entries(overrides.cargo)) {
        if (v === null) delete cargoSnapshot.cargo[k]
        else cargoSnapshot.cargo[k] = v
        edited.add(`cargo.${k}`)
      }
    }
  }
  let routeStops: unknown[] | null = null
  if (overrides.routeStops !== undefined) {
    routeStops = overrides.routeStops === null ? null : [...overrides.routeStops]
    edited.add('routeStops')
  }
  if (overrides.wishes !== undefined) {
    cargoSnapshot.wishes = strOrNull(overrides.wishes)
    edited.add('wishes')
  }

  const sourceFields = base.sourceFields.filter((k) => !edited.has(k))
  return {
    routeSnapshot,
    cargoSnapshot,
    routeStops,
    sourceFields,
    editedFields: [...edited],
  }
}

