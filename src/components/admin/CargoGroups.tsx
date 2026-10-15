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

// ─── Показ: группы бланка по cargoInfo ─────────────────────────────
// Пустая анкета — muted-подсказка (текст настраивается: у лида и у
// заявки формулировки разные); анкета с чужими ключами — как есть, в
// JSON (данные не теряем).
export function CargoGroups({
  cargoInfo,
  emptyText,
}: {
  cargoInfo: unknown
  emptyText: string
}) {
  const c: LeadCargoData = readLeadCargo(cargoInfo)
  const txt = (k: keyof LeadCargoForm): string | null => {
    const v = c[k]
    return typeof v === 'string' && v.trim() ? v : null
  }
  const numOf = (k: keyof LeadCargoForm): number | null => {
    const v = c[k]
    return typeof v === 'number' && Number.isFinite(v) ? v : null
  }
  const boolTxt = (k: keyof LeadCargoForm): string | null => {
    const v = c[k]
    return v === true ? 'Да' : v === false ? 'Нет' : null
  }
  const dateTxt = (k: keyof LeadCargoForm): string | null => {
    const v = c[k]
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
      return new Date(v + 'T00:00:00').toLocaleDateString('ru-RU')
    }
    return null
  }

  const routeEntries: [string, string | null][] = [
    ['Тип перевозки', txt('transportType')],
    ['Пункт отправления', txt('from')],
    ['Пункт прибытия', txt('to')],
    ['Маршрут (подробно)', txt('routeNote')],
    ['Предв. дата отправления', dateTxt('shipDate')],
  ]

  const cargoEntries: [string, string | null][] = [
    ['Наименование груза', txt('cargoName')],
    ['Код ТН ВЭД', txt('hsCode')],
    ['Количество мест', numOf('placesCount') !== null ? String(numOf('placesCount')) : null],
    [
      'Общий вес брутто, кг',
      numOf('weightKg') !== null ? fmtNum(numOf('weightKg') as number) : null,
    ],
    ['Общий объём, м³', numOf('volumeM3') !== null ? fmtNum(numOf('volumeM3') as number) : null],
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

  const hasAnyCargo =
    routeEntries.some(([, v]) => v) ||
    cargoEntries.some(([, v]) => v) ||
    shipperEntries.some(([, v]) => v) ||
    consigneeEntries.some(([, v]) => v)

  const knownKeys = new Set(Object.keys(LEAD_CARGO_LABELS))
  const unknownCargo =
    cargoInfo &&
    typeof cargoInfo === 'object' &&
    Object.keys(cargoInfo).length > 0 &&
    !Object.keys(cargoInfo).some((k) => knownKeys.has(k))

  if (!hasAnyCargo) {
    if (unknownCargo) {
      return (
        <pre className="text-xs bg-muted rounded-md p-3 overflow-x-auto">
          {JSON.stringify(cargoInfo, null, 2)}
        </pre>
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
    </div>
  )
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
  // поле не попадает в cargoInfo (buildLeadCargo пропускает пустые).
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
                    {/* 'none' = «не указано»: buildLeadCargo такое
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
