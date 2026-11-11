'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Plus, Trash2 } from 'lucide-react'
import { ReferenceCombobox, type RefPick } from '@/components/references/ReferenceCombobox'
import type { RouteStop } from '@/lib/leads'

// ─── DF-27 волна 1: блоки 1–3 формы варианта (ТЗ §8; план §10) ──────
// (1) Исходные данные запроса — автозаполнено, только чтение;
// (2) Маршрут и транспорт — адаптация + промежуточные точки;
// (3) Характеристики груза — снимок с корректировкой.
// Метки происхождения «из запроса» / «изменено» — по provenance
// (sourceFields/editedFields) варианта.

export type ProvenanceInfo = {
  sourceFields: string[]
  editedFields: string[]
}

export function OriginBadge({ field, provenance }: { field: string; provenance: ProvenanceInfo | null }) {
  if (!provenance) return null
  if (provenance.editedFields.includes(field)) {
    return (
      <Badge variant="outline" className="text-xs px-1.5 py-0">
        изменено
      </Badge>
    )
  }
  if (provenance.sourceFields.includes(field)) {
    return (
      <Badge variant="outline" className="text-xs px-1.5 py-0 text-muted-foreground">
        из запроса
      </Badge>
    )
  }
  return null
}

export type LeadBlankView = {
  origin: string
  destination: string
  transportType: string
  readyDate: string
  incoterm: string
  cargoName: string
  hsCode: string
  weight: string
  volume: string
  places: string
  value: string
}
export function LeadSourceBlock({ lead }: { lead: LeadBlankView }) {
  const rows: Array<[string, string]> = [
    ['Маршрут', [lead.origin, lead.destination].filter(Boolean).join(' → ')],
    ['Тип перевозки', lead.transportType],
    ['Дата готовности', lead.readyDate],
    ['Инкотермс', lead.incoterm],
    ['Груз', lead.cargoName],
    ['ТН ВЭД', lead.hsCode],
    ['Вес / объём / места', [lead.weight && `${lead.weight} кг`, lead.volume && `${lead.volume} м³`, lead.places && `${lead.places} мест`].filter(Boolean).join(' · ')],
    ['Стоимость груза', lead.value],
  ]
  return (
    <div className="grid gap-1.5 rounded-md border bg-muted/30 p-3">
      <div className="text-xs font-medium text-muted-foreground">
        1. Исходные данные запроса — подставляются в вариант автоматически
      </div>
      {rows.map(([label, value]) => (
        <div key={label} className="flex flex-wrap justify-between gap-2 text-sm">
          <span className="text-muted-foreground">{label}</span>
          <span className="text-right">{value || '—'}</span>
        </div>
      ))}
    </div>
  )
}

export type OptionRouteForm = {
  originCity: string
  originCountryCode: string
  destinationCity: string
  destinationCountryCode: string
  transportType: string
  readyDate: string
  wishes: string
}

// Блок 2 — маршрут и транспорт: пустое поле = «как в запросе»
export function OptionRouteBlock({
  form,
  onChange,
  provenance,
  stops,
  onStopsChange,
}: {
  form: OptionRouteForm
  onChange: (patch: Partial<OptionRouteForm>) => void
  provenance: ProvenanceInfo | null
  stops: RouteStop[]
  onStopsChange: (stops: RouteStop[]) => void
}) {
  return (
    <div className="grid gap-3">
      <div className="text-xs font-medium text-muted-foreground">
        2. Маршрут и транспорт — заполните, чтобы отклониться от запроса
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="opt-orig-city">
            Пункт отправления <OriginBadge field="route.originCity" provenance={provenance} />
          </Label>
          <Input
            id="opt-orig-city"
            placeholder="как в запросе"
            value={form.originCity}
            onChange={(e) => onChange({ originCity: e.target.value })}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="opt-orig-country">
            Страна отправления <OriginBadge field="route.originCountryCode" provenance={provenance} />
          </Label>
          <ReferenceCombobox
            dir="country"
            value={form.originCountryCode}
            onPick={(pick: RefPick) => onChange({ originCountryCode: pick && pick.code ? pick.code : '' })}
            placeholder="как в запросе"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="opt-dest-city">
            Пункт прибытия <OriginBadge field="route.destinationCity" provenance={provenance} />
          </Label>
          <Input
            id="opt-dest-city"
            placeholder="как в запросе"
            value={form.destinationCity}
            onChange={(e) => onChange({ destinationCity: e.target.value })}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="opt-dest-country">
            Страна прибытия <OriginBadge field="route.destinationCountryCode" provenance={provenance} />
          </Label>
          <ReferenceCombobox
            dir="country"
            value={form.destinationCountryCode}
            onPick={(pick: RefPick) => onChange({ destinationCountryCode: pick && pick.code ? pick.code : '' })}
            placeholder="как в запросе"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="opt-transport">
            Тип перевозки <OriginBadge field="route.transportType" provenance={provenance} />
          </Label>
          <Input
            id="opt-transport"
            placeholder="как в запросе"
            value={form.transportType}
            onChange={(e) => onChange({ transportType: e.target.value })}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="opt-ready">
            Дата готовности <OriginBadge field="route.readyDate" provenance={provenance} />
          </Label>
          <Input
            id="opt-ready"
            type="date"
            value={form.readyDate}
            onChange={(e) => onChange({ readyDate: e.target.value })}
          />
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label>
          Промежуточные точки <OriginBadge field="routeStops" provenance={provenance} />
        </Label>
        {stops.map((s, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input
              placeholder="Город"
              value={s.city}
              onChange={(e) =>
                onStopsChange(stops.map((x, j) => (j === i ? { ...x, city: e.target.value } : x)))
              }
              className="flex-1"
            />
            <Input
              placeholder="примечание (не обязательно)"
              value={s.note ?? ''}
              onChange={(e) =>
                onStopsChange(stops.map((x, j) => (j === i ? { ...x, note: e.target.value } : x)))
              }
              className="flex-1"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8 text-destructive hover:text-destructive"
              onClick={() => onStopsChange(stops.filter((_, j) => j !== i))}
              aria-label="Удалить точку"
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-fit"
          onClick={() => onStopsChange([...stops, { city: '', country: null, note: '' }])}
        >
          <Plus className="size-4" />
          Добавить точку
        </Button>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="opt-wishes">
          Пожелания к перевозке <OriginBadge field="wishes" provenance={provenance} />
        </Label>
        <Textarea
          id="opt-wishes"
          rows={2}
          placeholder="Особые пожелания по этому варианту (не обязательно)"
          value={form.wishes}
          onChange={(e) => onChange({ wishes: e.target.value })}
        />
      </div>
    </div>
  )
}

// Блок 3 (характеристики груза) вынесен в QuoteOptionCargoBlock.tsx
// (RULES 2.14: файл компонента ≤ 300 строк); тип OptionCargoForm и
// ключи provenance переэкспортируются ниже для совместимости импортов.

export type {
  OptionCargoForm,
} from '@/components/admin/QuoteOptionCargoBlock'

