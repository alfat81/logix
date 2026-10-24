import { z } from 'zod'
import {
  LEAD_CARGO_LABELS,
  RawContactSchema,
  CargoInfoSchema,
  readLeadCargo,
  type RawContact,
} from '@/lib/leads'

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
  })
  .refine((d) => d.rawContact !== undefined || d.cargoInfo !== undefined, {
    message: 'Нечего обновлять: укажите rawContact или cargoInfo',
  })
export type LeadEditInput = z.infer<typeof LeadEditSchema>

// Тело PATCH из кабинета клиента: клиент правит ТОЛЬКО анкету груза
// (контакты — из его учётки, Customer — справочная сущность).
export const ClientLeadEditSchema = z
  .object({ cargoInfo: CargoInfoSchema.optional() })
  .refine((d) => d.cargoInfo !== undefined, {
    message: 'Нечего обновлять: укажите cargoInfo',
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
  const s = String(v).trim()
  return s || '—'
}

function sameDiffValue(a: unknown, b: unknown): boolean {
  // Число и строка-число считаются равными («1200» и 1200 — одно значение:
  // старые лиды могли сохранить вес строкой).
  if (typeof a === 'number' || typeof b === 'number') {
    const na = typeof a === 'number' ? a : Number(String(a ?? '').replace(',', '.'))
    const nb = typeof b === 'number' ? b : Number(String(b ?? '').replace(',', '.'))
    if (Number.isFinite(na) && Number.isFinite(nb)) return na === nb
  }
  return fmtDiffValue(a) === fmtDiffValue(b)
}

// ── Подписи полей в журнале ─────────────────────────────────────────
// Короткие имена (приёмка: «Вес», а не «Общий вес брутто, кг») и
// состав = известные ключи анкеты (LEAD_CARGO_LABELS) — единый список:
// новое поле формы автоматически попадает и в diff, и в merge.
const CARGO_DIFF_LABELS: Partial<Record<keyof typeof LEAD_CARGO_LABELS, string>> = {
  transportType: 'Тип перевозки',
  from: 'Пункт отправления',
  to: 'Пункт прибытия',
  routeNote: 'Маршрут',
  shipDate: 'Дата отправления',
  cargoName: 'Груз',
  hsCode: 'Код ТН ВЭД',
  placesCount: 'Мест',
  weightKg: 'Вес',
  volumeM3: 'Объём',
  packaging: 'Упаковка',
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

type ExistingAnketa = { rawContact?: unknown; cargoInfo: unknown }
type IncomingAnketa = { rawContact?: RawContact; cargoInfo?: Record<string, unknown> | null }

// Diff анкеты: список строк «Подпись: старое → новое» (только реально
// изменившиеся поля). Старые значения читаются толерантно
// (readLeadCargo) — лиды с чужой/старой формой Json не роняют журнал.
export function buildLeadEditDiff(
  existing: ExistingAnketa,
  incoming: IncomingAnketa,
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
  const merged = { ...kept, ...(newCargo ?? {}) }
  return Object.keys(merged).length ? merged : null
}

// Окно правки анкеты (P1-02): new/calculated. won — история (правится
// через заявку), lost — закрытая сделка (вернуть в работу может мастер).
export function isLeadAnketaEditable(status: string): boolean {
  return status === 'new' || status === 'calculated'
}
