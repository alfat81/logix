'use client'

'use client'

// ─── Анкета груза: показ (Ж1) ───────────────────────────────────────
// Общие куски для лида (В5) и заявки (Ж1): cargoInfo — одна и та же
// форма бланка заявки клиента, поэтому показ (группы «Маршрут / Груз /
// Грузоотправитель / Грузополучатель») живёт здесь, а не копируется по
// компонентам. Чтение — толерантное (readLeadCargo): неизвестные ключи
// показываются как есть, UI не падает.
//
// v0.5.0 (P1-22): форма (CargoFormFields) выезжает в соседний файл
// (резка под лимит 300, RULES 2.14); прежний путь CargoGroups.tsx
// оставлен бочкой-реэкспортом для 9 импортёров.
import {
  LEAD_CARGO_LABELS,
  readLeadCargo,
  type LeadCargoData,
  type LeadCargoForm,
} from '@/lib/leads'
import {
  TRANSPORT_TYPE_LABELS,
  joinRouteText,
} from '@/lib/route-fields'


const fmtNum = (n: number): string => new Intl.NumberFormat('ru-RU').format(n)

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="font-medium break-words">{value}</span>
    </div>
  )
}

function Group({ title, entries }: { title: string; entries: [string, string | null][] }) {
  const filled = entries.filter(([, v]) => v)
  if (!filled.length) return null
  return (
    <div className="grid gap-2">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        {filled.map(([label, value]) => (
          <Info key={label} label={label} value={value as string} />
        ))}
      </div>
    </div>
  )
}

// ─── Показ: группы бланка (колонки P1-03 + cargoInfo-rest) ─────────
// Маршрут и метрики (тип/пункты/дата/вес/объём/места) читаются из
// колонок route (P1-03), «остальное» — из cargoInfo (v: 1). Неизвестные
// ключи Json показываются блоком «Прочее» — данные не теряются.
// Чтение толерантно: Decimal приходит строкой, Date — ISO-строкой.

export type RouteView = {
  originCity?: unknown
  originCountry?: unknown
  destinationCity?: unknown
  destinationCountry?: unknown
  transportType?: unknown
  readyDate?: unknown
  weightKg?: unknown
  volumeM3?: unknown
  placesCount?: unknown
}

const numToStr = (v: unknown): string | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return fmtNum(v)
  if (typeof v === 'string' && v.trim() && Number.isFinite(Number(v))) {
    return fmtNum(Number(v))
  }
  // Decimal из Prisma (toNumber)
  if (v && typeof v === 'object' && typeof (v as { toNumber?: unknown }).toNumber === 'function') {
    const n = (v as unknown as { toNumber: () => number }).toNumber()
    if (Number.isFinite(n)) return fmtNum(n)
  }
  return null
}

const dateToStr = (v: unknown): string | null => {
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return v.toLocaleDateString('ru-RU')
  }
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) {
    return new Date(v.slice(0, 10) + 'T00:00:00').toLocaleDateString('ru-RU')
  }
  return null
}

export function CargoGroups({
  route,
  cargoInfo,
  emptyText,
}: {
  route?: RouteView | null
  cargoInfo: unknown
  emptyText: string
}) {
  const r: RouteView = route ?? {}
  const c: LeadCargoData = readLeadCargo(cargoInfo)
  const txt = (k: keyof LeadCargoForm): string | null => {
    const v = c[k]
    return typeof v === 'string' && v.trim() ? v : null
  }
  const boolTxt = (k: keyof LeadCargoForm): string | null => {
    const v = c[k]
    return v === true ? 'Да' : v === false ? 'Нет' : null
  }

  // Маршрут — из колонок (легаси-ключи Json — fallback)
  const transportLabel =
    (typeof r.transportType === 'string' && r.transportType in TRANSPORT_TYPE_LABELS
      ? TRANSPORT_TYPE_LABELS[r.transportType as keyof typeof TRANSPORT_TYPE_LABELS]
      : null) || txt('transportType')
  const legacy = c as Record<string, unknown>
  const legacyStr = (k: string): string | null => {
    const v = legacy[k]
    return typeof v === 'string' && v.trim() ? v : null
  }
  const origin = joinRouteText(r.originCountry, r.originCity) || legacyStr('from') || legacyStr('origin')
  const destination =
    joinRouteText(r.destinationCountry, r.destinationCity) || legacyStr('to') || legacyStr('destination')
  const readyDate = dateToStr(r.readyDate) || dateTxtFallback(c.shipDate)

  const routeEntries: [string, string | null][] = [
    ['Тип перевозки', transportLabel],
    ['Пункт отправления', origin],
    ['Пункт прибытия', destination],
    ['Предв. дата отправления', readyDate],
    ['Маршрут (подробно)', txt('routeNote')],
  ]

  const cargoEntries: [string, string | null][] = [
    ['Наименование груза', txt('cargoName')],
    ['Код ТН ВЭД', txt('hsCode')],
    ['Количество мест', numToStr(r.placesCount)],
    ['Общий вес брутто, кг', numToStr(r.weightKg)],
    ['Общий объём, м³', numToStr(r.volumeM3)],
    ['Тип упаковки', txt('packaging')],
    ['Стоимость груза', txt('cargoValue')],
    ['Опасный груз', boolTxt('dangerous')],
    ['Штабелирование', boolTxt('stackable')],
    ['Кантование', boolTxt('tiltable')],
    ['Особые требования', txt('specialRequirements')],
  ]

  const shipperEntries: [string, string | null][] = [
    ['Наименование', txt('shipperName')],
    ['ИНН', txt('shipperInn')],
    ['Адрес', txt('shipperAddress')],
  ]

  const consigneeEntries: [string, string | null][] = [
    ['Наименование', txt('consigneeName')],
    ['ИНН', txt('consigneeInn')],
    ['Адрес', txt('consigneeAddress')],
  ]

  // «Прочее»: неизвестные ключи анкеты (v — служебный, не показываем).
  // Пустые значения и служебный JSON-вид заменяем строкой — данные видны.
  const knownKeys = new Set(Object.keys(LEAD_CARGO_LABELS))
  const otherEntries: [string, string][] = cargoInfo &&
  typeof cargoInfo === 'object' && !Array.isArray(cargoInfo)
    ? Object.entries(cargoInfo as Record<string, unknown>)
        .filter(([k]) => k !== 'v' && !knownKeys.has(k))
        .map(([k, v]) => {
          if (v === null || v === undefined || v === '') return [k, '—'] as [string, string]
          if (typeof v === 'boolean') return [k, v ? 'Да' : 'Нет'] as [string, string]
          if (typeof v === 'object') return [k, JSON.stringify(v)] as [string, string]
          return [k, String(v)] as [string, string]
        })
    : []

  const hasAnyCargo =
    routeEntries.some(([, v]) => v) ||
    cargoEntries.some(([, v]) => v) ||
    shipperEntries.some(([, v]) => v) ||
    consigneeEntries.some(([, v]) => v)

  if (!hasAnyCargo) {
    if (otherEntries.length > 0) {
      return (
        <div className="grid gap-2">
          <OtherGroup entries={otherEntries} />
        </div>
      )
    }
    return <span className="text-muted-foreground text-sm">{emptyText}</span>
  }

  return (
    <div className="grid gap-5">
      <Group title="Маршрут" entries={routeEntries} />
      <Group title="Груз" entries={cargoEntries} />
      {shipperEntries.some(([, v]) => v) && (
        <Group title="Грузоотправитель" entries={shipperEntries} />
      )}
      {consigneeEntries.some(([, v]) => v) && (
        <Group title="Грузополучатель" entries={consigneeEntries} />
      )}
      {otherEntries.length > 0 && <OtherGroup entries={otherEntries} />}
    </div>
  )
}

// Блок «Прочее»: нестандартные ключи анкеты (легаси/импорт) — видны,
// но не теряются (P1-03)
function OtherGroup({ entries }: { entries: [string, string][] }) {
  return (
    <div className="grid gap-2">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Прочее
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        {entries.map(([label, value]) => (
          <Info key={label} label={label} value={value} />
        ))}
      </div>
    </div>
  )
}

// Легаси-дата из Json (string yyyy-mm-dd) — до P1-03 ключ был в анкете
function dateTxtFallback(v: unknown): string | null {
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
    return new Date(v + 'T00:00:00').toLocaleDateString('ru-RU')
  }
  return null
}

