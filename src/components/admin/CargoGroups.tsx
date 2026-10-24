'use client'

// ─── Анкета груза: показ и форма (Ж1) ──────────────────────────────
// Общие куски для лида (В5) и заявки (Ж1): cargoInfo — одна и та же
// форма бланка заявки клиента, поэтому показ (группы «Маршрут / Груз /
// Грузоотправитель / Грузополучатель») и поля формы живут здесь, а не
// копируются по компонентам. Чтение — толерантное (readLeadCargo):
// неизвестные ключи показываются как есть, UI не падает.

import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  LEAD_CARGO_LABELS,
  TRANSPORT_TYPES,
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
  const origin = joinRouteText(r.originCountry, r.originCity) || txt('from') || legacyStr('origin')
  const destination =
    joinRouteText(r.destinationCountry, r.destinationCity) || txt('to') || legacyStr('destination')
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

// ─── Форма: поля бланка (значения — строки, см. LeadCargoForm) ─────
// Используется диалогом создания лида (В5) и правкой груза заявки (Ж1):
// один бланк — одно место правки. onChange получает СЛЕДУЮЩЕЕ
// состояние целиком (компонент неконтролируемо ничего не хранит).
export function CargoFormFields({
  form,
  onChange,
}: {
  form: LeadCargoForm
  onChange: (next: LeadCargoForm) => void
}) {
  const set = (key: keyof LeadCargoForm, value: string) =>
    onChange({ ...form, [key]: value })

  // Значения Select'ов: 'none' = «не указано» → пустая строка,
  // поле не попадает в cargoInfo (buildLeadPayload пропускает пустые).
  const setSelected = (key: keyof LeadCargoForm, value: string) =>
    set(key, value === 'none' ? '' : value)

  return (
    <div className="grid gap-5">
      {/* ── Маршрут (бланк: тип перевозки, пункты, дата) ── */}
      <div className="grid gap-2">
        <div className="text-sm font-medium">Маршрут</div>
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground">Тип перевозки</Label>
            <Select value={form.transportType} onValueChange={(v) => setSelected('transportType', v)}>
              <SelectTrigger>
                <SelectValue placeholder="Не выбран" />
              </SelectTrigger>
              <SelectContent>
                {TRANSPORT_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground">Предв. дата отправления</Label>
            <Input
              type="date"
              value={form.shipDate}
              onChange={(e) => set('shipDate', e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground">Пункт отправления</Label>
            <Input
              placeholder="Например: Китай, Чэнду"
              value={form.from}
              onChange={(e) => set('from', e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground">Пункт прибытия</Label>
            <Input
              placeholder="Например: Россия, а/п Шереметьево"
              value={form.to}
              onChange={(e) => set('to', e.target.value)}
            />
          </div>
          <div className="grid gap-1.5 col-span-2">
            <Label className="text-xs text-muted-foreground">Маршрут (подробно)</Label>
            <Input
              placeholder="Полный маршрут с промежуточными пунктами — не обязательно"
              value={form.routeNote}
              onChange={(e) => set('routeNote', e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* ── Груз (бланк: наименование … особые требования) ── */}
      <div className="grid gap-2">
        <div className="text-sm font-medium">Груз</div>
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5 col-span-2">
            <Label className="text-xs text-muted-foreground">Наименование груза</Label>
            <Input
              placeholder="Например: Клапан, цилиндр"
              value={form.cargoName}
              onChange={(e) => set('cargoName', e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground">Код ТН ВЭД</Label>
            <Input
              placeholder="Например, 8479 — не обязательно"
              value={form.hsCode}
              onChange={(e) => set('hsCode', e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground">Тип упаковки</Label>
            <Input
              placeholder="Например: Коробки"
              value={form.packaging}
              onChange={(e) => set('packaging', e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground">Количество мест</Label>
            <Input
              inputMode="numeric"
              placeholder="2"
              value={form.placesCount}
              onChange={(e) => set('placesCount', e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground">Общий вес брутто, кг</Label>
            <Input
              inputMode="decimal"
              placeholder="19,5"
              value={form.weightKg}
              onChange={(e) => set('weightKg', e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground">Общий объём, м³</Label>
            <Input
              inputMode="decimal"
              placeholder="0,8"
              value={form.volumeM3}
              onChange={(e) => set('volumeM3', e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground">Стоимость груза</Label>
            <Input
              placeholder="Например: 500 000 руб. — не обязательно"
              value={form.cargoValue}
              onChange={(e) => set('cargoValue', e.target.value)}
            />
          </div>
          <div className="grid grid-cols-3 gap-3 col-span-2">
            {(
              [
                ['dangerous', 'Опасный груз'],
                ['stackable', 'Штабелирование'],
                ['tiltable', 'Кантование'],
              ] as const
            ).map(([key, label]) => (
              <div key={key} className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">{label}</Label>
                <Select value={form[key]} onValueChange={(v) => setSelected(key, v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    {/* 'none' = «не указано»: buildLeadPayload такое
                        значение не включает в cargoInfo */}
                    <SelectItem value="none">—</SelectItem>
                    <SelectItem value="yes">Да</SelectItem>
                    <SelectItem value="no">Нет</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
          <div className="grid gap-1.5 col-span-2">
            <Label className="text-xs text-muted-foreground">Особые требования</Label>
            <Textarea
              rows={2}
              placeholder="Температурный режим, хрупкое, документы и т.п. — не обязательно"
              value={form.specialRequirements}
              onChange={(e) => set('specialRequirements', e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* ── Стороны: грузоотправитель и грузополучатель ── */}
      <div className="grid grid-cols-2 gap-3">
        {(
          [
            ['Грузоотправитель', 'shipper'],
            ['Грузополучатель', 'consignee'],
          ] as const
        ).map(([title, side]) => (
          <div key={side} className="grid gap-2 content-start">
            <div className="text-sm font-medium">{title}</div>
            <Input
              placeholder="Наименование"
              value={form[`${side}Name` as keyof LeadCargoForm] as string}
              onChange={(e) => set(`${side}Name` as keyof LeadCargoForm, e.target.value)}
            />
            <Input
              placeholder="ИНН — не обязательно"
              value={form[`${side}Inn` as keyof LeadCargoForm] as string}
              onChange={(e) => set(`${side}Inn` as keyof LeadCargoForm, e.target.value)}
            />
            <Input
              placeholder="Адрес — не обязательно"
              value={form[`${side}Address` as keyof LeadCargoForm] as string}
              onChange={(e) => set(`${side}Address` as keyof LeadCargoForm, e.target.value)}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
