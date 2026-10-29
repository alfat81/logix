import { z } from 'zod'
import { db } from '@/lib/db'
import {
  LEAD_CARGO_LABELS,
  RawContactSchema,
  CargoInfoSchema,
  readLeadCargo,
  type RawContact,
} from '@/lib/leads'
import {
  RouteFieldsSchema,
  TRANSPORT_TYPE_LABELS,
  joinRouteText,
  type TransportTypeCode,
  type RouteFieldsInput,
} from '@/lib/route-fields'

// ─── P1-02: правка анкеты лида (контакты + груз) ────────────────────
//
// Раньше состав лида через PATCH не менялся (анкета — «черновик»,
// правка пересозданием, решение В2). P1-02 меняет контракт: анкета
// правится в статусах new/calculated, после won — только через заявку;
// каждое изменение уходит в журнал как diff «Поле: старое → новое»
// (приёмка P1-02: «Вес: 1 200 → 1 450»).
//
// Файл БЕЗ серверных зависимостей (db и т.п.): его импортируют и
// админский PATCH лида, и PATCH кабинета клиента, и UI-диалоги правки.

// Тело PATCH анкеты — админский роут (контакты + груз; контакты правятся
// только у лида БЕЗ клиента: у связанного клиента контакты живут в
// справочнике Customer — их правка вне этого роута, см. P1-07).
// cargoInfo — полная замена ИЗВЕСТНЫХ полей; неизвестные ключи старого
// Json сохраняются (mergeLeadCargo), принцип P1-03 «данные не теряются».
export const LeadEditSchema = z
  .object({
    rawContact: RawContactSchema.optional(),
    cargoInfo: CargoInfoSchema.optional(),
    // P1-03: маршрут/метрики — колонки, отдельным блоком route
    route: RouteFieldsSchema.optional(),
  })
  .refine(
    (d) => d.rawContact !== undefined || d.cargoInfo !== undefined || d.route !== undefined,
    {
      message: 'Нечего обновлять: укажите rawContact, cargoInfo или route',
    }
  )
export type LeadEditInput = z.infer<typeof LeadEditSchema>

// Тело PATCH из кабинета клиента: клиент правит ТОЛЬКО анкету груза
// (контакты — из его учётки, Customer — справочная сущность).
export const ClientLeadEditSchema = z
  .object({
    cargoInfo: CargoInfoSchema.optional(),
    route: RouteFieldsSchema.optional(),
  })
  .refine((d) => d.cargoInfo !== undefined || d.route !== undefined, {
    message: 'Нечего обновлять: укажите cargoInfo или route',
  })
export type ClientLeadEditInput = z.infer<typeof ClientLeadEditSchema>

// ── Форматирование значений для diff ────────────────────────────────
// Числа: целая часть группируется по 3 с ОБЫЧНЫМ пробелом («1 200» —
// как в приёмке P1-02), десятичный разделитель — запятая. Ручная
// сборка вместо Intl: журнал не зависит от ICU-окружения, и e2e может
// сверять строку дословно.
export function fmtDiffNum(n: number): string {
  if (!Number.isFinite(n)) return String(n)
  const neg = n < 0
  const [int, frac] = Math.abs(n).toString().split('.')
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  return (neg ? '-' : '') + grouped + (frac ? ',' + frac : '')
}

function fmtDiffValue(v: unknown): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'boolean') return v ? 'Да' : 'Нет'
  if (typeof v === 'number') return fmtDiffNum(v)
  // Decimal из Prisma-колонок (вес/объём): объект с toNumber — числа
  // с русским форматированием, как и обычные number
  if (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as { toNumber?: unknown }).toNumber === 'function'
  ) {
    const n = (v as unknown as { toNumber: () => number }).toNumber()
    return Number.isFinite(n) ? fmtDiffNum(n) : String(v)
  }
  if (v instanceof Date) return fmtDiffDate(v)
  const s = String(v).trim()
  return s || '—'
}

function sameDiffValue(a: unknown, b: unknown): boolean {
  // Decimal → строка → число; число и строка-число считаются равными
  // («1200», 1200 и Decimal(1200) — одно значение)
  const num = (x: unknown): number | null => {
    if (typeof x === 'number') return Number.isFinite(x) ? x : null
    if (
      typeof x === 'object' &&
      x !== null &&
      typeof (x as { toNumber?: unknown }).toNumber === 'function'
    ) {
      const n = (x as unknown as { toNumber: () => number }).toNumber()
      return Number.isFinite(n) ? n : null
    }
    if (typeof x === 'string' && x.trim()) {
      const n = Number(x.replace(',', '.'))
      return Number.isFinite(n) ? n : null
    }
    return null
  }
  const na = num(a)
  const nb = num(b)
  if (na !== null && nb !== null) return na === nb
  return fmtDiffValue(a) === fmtDiffValue(b)
}

// ── Подписи полей в журнале ─────────────────────────────────────────
// Короткие имена (приёмка: «Вес», а не «Общий вес брутто, кг») и
// состав = известные ключи анкеты (LEAD_CARGO_LABELS) — единый список:
// новое поле формы автоматически попадает и в diff, и в merge.
const CARGO_DIFF_LABELS: Partial<Record<keyof typeof LEAD_CARGO_LABELS, string>> = {
  transportType: 'Тип перевозки',
  routeNote: 'Маршрут',
  shipDate: 'Дата отправления',
  cargoName: 'Груз',
  hsCode: 'Код ТН ВЭД',
  placesCount: 'Мест',
  weightKg: 'Вес',
  volumeM3: 'Объём',
  packaging: 'Упаковка',
  packagingCode: 'Упаковка (код)',
  cargoValue: 'Стоимость груза',
  dangerous: 'Опасный груз',
  stackable: 'Штабелирование',
  tiltable: 'Кантование',
  specialRequirements: 'Особые требования',
  shipperName: 'Грузоотправитель',
  shipperInn: 'Грузоотправитель, ИНН',
  shipperAddress: 'Грузоотправитель, адрес',
  consigneeName: 'Грузополучатель',
  consigneeInn: 'Грузополучатель, ИНН',
  consigneeAddress: 'Грузополучатель, адрес',
}

const CONTACT_DIFF_LABELS: Record<keyof Omit<RawContact, never>, string> = {
  name: 'Контакт',
  phone: 'Телефон',
  email: 'Email',
}

// Дата для diff: дд.мм.гггг (Date из колонки readyDate или ISO-строка)
function fmtDiffDate(v: unknown): string {
  const d = v instanceof Date ? v : typeof v === 'string' ? new Date(v) : null
  if (!d || Number.isNaN(d.getTime())) return '—'
  const dd = String(d.getUTCDate()).padStart(2, '0')
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  return `${dd}.${mm}.${d.getUTCFullYear()}`
}

// Подписи route-колонок в diff (короткие, как в приёмке P1-02 «Вес»)
const ROUTE_DIFF_LABELS = {
  origin: 'Откуда',
  destination: 'Куда',
  transportType: 'Тип перевозки',
  readyDate: 'Дата отправления',
  weightKg: 'Вес',
  volumeM3: 'Объём',
  placesCount: 'Мест',
} as const

type ExistingRow = {
  rawContact?: unknown
  cargoInfo: unknown
  originCity?: unknown
  originCountry?: unknown
  destinationCity?: unknown
  destinationCountry?: unknown
  transportType?: unknown
  readyDate?: unknown
  weightKg?: unknown
  volumeM3?: unknown
  placesCount?: unknown
  incotermCode?: unknown
  incotermPlace?: unknown
}
type IncomingEdit = {
  rawContact?: RawContact
  cargoInfo?: Record<string, unknown> | null
  route?: RouteFieldsInput
  incotermCode?: string | null
  incotermPlace?: string | null
}

// Diff анкеты: список строк «Подпись: старое → новое» (только реально
// изменившиеся поля). Старые значения читаются толерантно — лиды/заявки
// с чужой формой Json и Decimal-колонками не роняют журнал.
export function buildLeadEditDiff(
  existing: ExistingRow,
  incoming: IncomingEdit,
): string[] {
  const out: string[] = []

  if (incoming.rawContact !== undefined) {
    const old = (existing.rawContact && typeof existing.rawContact === 'object'
      ? existing.rawContact
      : {}) as Partial<RawContact>
    for (const key of Object.keys(CONTACT_DIFF_LABELS) as (keyof RawContact)[]) {
      const prev = old[key] ?? null
      const next = incoming.rawContact[key] ?? null
      if (!sameDiffValue(prev, next)) {
        out.push(`${CONTACT_DIFF_LABELS[key]}: ${fmtDiffValue(prev)} → ${fmtDiffValue(next)}`)
      }
    }
  }

  // ── P1-03: маршрут и метрики — diff по колонкам ──
  // undefined в route = «поле не трогаем» (семантика записи) — в diff
  // не попадает; null = очистить (сравнивается честно, «X → —»).
  if (incoming.route !== undefined) {
    const r = incoming.route
    const pushDiff = (label: string, prev: unknown, next: unknown): void => {
      if (!sameDiffValue(prev, next)) {
        out.push(`${label}: ${fmtDiffValue(prev)} → ${fmtDiffValue(next)}`)
      }
    }
    // Пара «страна, город»: присланное оверлейится на существующее
    // (undefined на ПОЛОВИНЕ пары = «эту половину не трогаем») — иначе
    // правка только страны рисовала фантомное «→ —» для города
    if (r.originCity !== undefined || r.originCountry !== undefined) {
      const c = r.originCountry !== undefined ? r.originCountry : existing.originCountry
      const t = r.originCity !== undefined ? r.originCity : existing.originCity
      pushDiff(
        ROUTE_DIFF_LABELS.origin,
        joinRouteText(existing.originCountry, existing.originCity),
        joinRouteText(c, t)
      )
    }
    if (r.destinationCity !== undefined || r.destinationCountry !== undefined) {
      const c = r.destinationCountry !== undefined ? r.destinationCountry : existing.destinationCountry
      const t = r.destinationCity !== undefined ? r.destinationCity : existing.destinationCity
      pushDiff(
        ROUTE_DIFF_LABELS.destination,
        joinRouteText(existing.destinationCountry, existing.destinationCity),
        joinRouteText(c, t)
      )
    }
    if (r.transportType !== undefined) {
      pushDiff(
        ROUTE_DIFF_LABELS.transportType,
        typeof existing.transportType === 'string' &&
          existing.transportType in TRANSPORT_TYPE_LABELS
          ? TRANSPORT_TYPE_LABELS[existing.transportType as TransportTypeCode]
          : existing.transportType ?? null,
        r.transportType ? (TRANSPORT_TYPE_LABELS[r.transportType] ?? r.transportType) : null
      )
    }
    if (r.readyDate !== undefined) {
      // Дата форматирована с обеих сторон (приход строкой 'yyyy-mm-dd'
      // из API — показываем как и колонку Date: дд.мм.гггг)
      pushDiff(
        ROUTE_DIFF_LABELS.readyDate,
        existing.readyDate ? fmtDiffDate(existing.readyDate) : null,
        r.readyDate ? fmtDiffDate(r.readyDate) : null
      )
    }
    if (r.weightKg !== undefined) {
      pushDiff(ROUTE_DIFF_LABELS.weightKg, existing.weightKg ?? null, r.weightKg ?? null)
    }
    if (r.volumeM3 !== undefined) {
      pushDiff(ROUTE_DIFF_LABELS.volumeM3, existing.volumeM3 ?? null, r.volumeM3 ?? null)
    }
    if (r.placesCount !== undefined) {
      pushDiff(ROUTE_DIFF_LABELS.placesCount, existing.placesCount ?? null, r.placesCount ?? null)
    }
  }

  // DF-17: условие поставки — код → подпись из легаси-текста (code =
  // EXW и есть читаемое обозначение; diff честно показывает код)
  if (incoming.incotermCode !== undefined) {
    const prev = typeof existing.incotermCode === 'string' ? existing.incotermCode : null
    const next = incoming.incotermCode || null
    if (prev !== next) {
      out.push(`Условия поставки: ${prev ?? '—'} → ${next ?? '—'}`)
    }
  }

  // DF-19: место условия поставки — свободный текст рядом с кодом
  if (incoming.incotermPlace !== undefined) {
    const prev = typeof existing.incotermPlace === 'string' ? existing.incotermPlace : null
    const next = incoming.incotermPlace?.trim() || null
    if (prev !== next) {
      out.push(`Место поставки: ${prev ?? '—'} → ${next ?? '—'}`)
    }
  }

  if (incoming.cargoInfo !== undefined) {
    const old = readLeadCargo(existing.cargoInfo) as Record<string, unknown>
    const next = incoming.cargoInfo ?? {}
    for (const key of Object.keys(CARGO_DIFF_LABELS)) {
      if (!(key in old) && !(key in next)) continue
      const prev = old[key] ?? null
      const val = next[key] ?? null
      if (!sameDiffValue(prev, val)) {
        out.push(`${CARGO_DIFF_LABELS[key as keyof typeof CARGO_DIFF_LABELS]}: ${fmtDiffValue(prev)} → ${fmtDiffValue(val)}`)
      }
    }
  }

  return out
}

// Полная замена известных полей анкеты груза с сохранением неизвестных
// ключей старого Json (P1-03: «Прочее», данные не теряются). null на
// входе = «очистить известные поля». Результат null = анкета пуста
// (в БД пишем null, как и при создании).
export function mergeLeadCargo(
  oldCargo: unknown,
  newCargo: Record<string, unknown> | null,
): Record<string, unknown> | null {
  const known = new Set(Object.keys(LEAD_CARGO_LABELS))
  const oldObj =
    oldCargo && typeof oldCargo === 'object' && !Array.isArray(oldCargo)
      ? (oldCargo as Record<string, unknown>)
      : {}
  const kept: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(oldObj)) {
    if (!known.has(k)) kept[k] = v
  }
  // v: 1 — маркер версии анкеты-rest (P1-03); перезаписывается сверху,
  // если пришёл с телом запроса. Только версия без содержимого = NULL.
  const merged = { ...kept, ...(newCargo ?? {}), v: 1 }
  return Object.keys(merged).length > 1 ? merged : null
}

// Окно правки анкеты (P1-02): new/calculated. won — история (правится
// через заявку), lost — закрытая сделка (вернуть в работу может мастер).
export function isLeadAnketaEditable(status: string): boolean {
  return status === 'new' || status === 'calculated'
}

// ─── P1-01: валидация смены ответственного (серверная, с db) ────────
// Вынесена из PATCH-роута лида (лимит 300 строк, RULES 2.14). Правило:
// целевой сотрудник должен существовать и быть активным; повторная
// установка того же — контракт роута (400 там).

export async function validateAssigneeChange(
  assignedToId: string
): Promise<{ error?: undefined; name: string } | { error: string; name?: undefined }> {
  const target = await db.employee.findUnique({
    where: { id: assignedToId },
    select: { name: true, isActive: true },
  })
  if (!target) return { error: 'Сотрудник не найден' }
  if (!target.isActive) {
    return { error: `Сотрудник «${target.name}» деактивирован — назначить нельзя` }
  }
  return { name: target.name }
}
