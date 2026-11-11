'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { OriginBadge, type ProvenanceInfo } from '@/components/admin/QuoteOptionRouteBlocks'

// ─── DF-27 волна 1: блок 3 формы варианта — характеристики груза ────
// (ТЗ §8; план §10.3). Выделен из QuoteOptionRouteBlocks (RULES 2.14:
// файл компонента ≤ 300 строк). Снимок с корректировкой: пустое поле =
// «как в запросе», метки происхождения — по provenance варианта.

export type OptionCargoForm = {
  cargoName: string
  hsCode: string
  placesCount: string
  weightKg: string
  volumeM3: string
  packaging: string
  cargoValue: string
  dangerous: string
  specialRequirements: string
}

// Ключи блока 3 → provenance-имена
export const CARGO_FORM_KEYS: Record<keyof OptionCargoForm, string> = {
  cargoName: 'cargo.cargoName',
  hsCode: 'cargo.hsCode',
  placesCount: 'cargo.placesCount',
  weightKg: 'cargo.weightKg',
  volumeM3: 'cargo.volumeM3',
  packaging: 'cargo.packaging',
  cargoValue: 'cargo.cargoValue',
  dangerous: 'cargo.dangerous',
  specialRequirements: 'cargo.specialRequirements',
}

// Блок 3 — характеристики груза: снимок с корректировкой
export function OptionCargoBlock({
  form,
  onChange,
  provenance,
}: {
  form: OptionCargoForm
  onChange: (patch: Partial<OptionCargoForm>) => void
  provenance: ProvenanceInfo | null
}) {
  const text = (key: keyof OptionCargoForm, id: string, label: string, placeholder = 'как в запросе') => (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>
        {label} <OriginBadge field={CARGO_FORM_KEYS[key]} provenance={provenance} />
      </Label>
      <Input
        id={id}
        placeholder={placeholder}
        value={form[key]}
        onChange={(e) => onChange({ [key]: e.target.value } as Partial<OptionCargoForm>)}
      />
    </div>
  )
  return (
    <div className="grid gap-3">
      <div className="text-xs font-medium text-muted-foreground">
        3. Характеристики груза — корректировка снимка запроса
      </div>
      <div className="grid grid-cols-2 gap-3">
        {text('cargoName', 'opt-cargo-name', 'Наименование груза')}
        {text('hsCode', 'opt-hs', 'Код ТН ВЭД')}
        {text('placesCount', 'opt-places', 'Количество мест')}
        {text('weightKg', 'opt-weight', 'Вес, кг')}
        {text('volumeM3', 'opt-volume', 'Объём, м³')}
        {text('packaging', 'opt-packaging', 'Тип упаковки')}
        {text('cargoValue', 'opt-value', 'Стоимость груза')}
        {text('dangerous', 'opt-dangerous', 'Опасный груз', 'да / нет')}
      </div>
      {text('specialRequirements', 'opt-special', 'Особые требования')}
    </div>
  )
}
