'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { QUOTE_PRIORITY_FITS, QUOTE_PRIORITY_FIT_LABELS, TRANSPORT_TYPES } from '@/lib/leads'
import { VAT_MODES, VAT_MODE_LABELS } from '@/lib/money'
import { ReferenceCombobox, type RefPick } from '@/components/references/ReferenceCombobox'

// ─── Поля формы варианта расчёта (В3, деньги P1-04) ────────────────
// Презентационная часть диалога (RULES 2.14: файл ≤ 300 строк):
// описание, виды транспорта, цена клиенту + валюта + НДС,
// себестоимость + валюта себестоимости, срок, ориентир. Состояние и
// сохранение — в QuoteOptionDialog; валидация ввода денег —
// parseMoneyInput (lib/money.ts) на стороне диалога.
// DF-17: валюты — Combobox справочника (IC-16): отключённая мастером
// валюта исчезает из форм; перечней литералами в коде нет.

export type OptionForm = {
  description: string
  price: string
  currency: string
  vatMode: string
  cost: string
  costCurrency: string
  etaDays: string
  priorityFit: string
  modes: string[]
}

export const EMPTY_OPTION_FORM: OptionForm = {
  description: '',
  price: '',
  currency: 'RUB',
  vatMode: 'WITHOUT_VAT',
  cost: '',
  costCurrency: 'RUB',
  etaDays: '',
  priorityFit: 'cost',
  modes: [],
}

export function QuoteOptionFormFields({
  form,
  onChange,
}: {
  form: OptionForm
  onChange: (patch: Partial<OptionForm>) => void
}) {
  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="opt-desc">Описание</Label>
        <Textarea
          id="opt-desc"
          rows={2}
          placeholder="Например: Авиа Пекин → Шереметьево, прямой рейс"
          value={form.description}
          onChange={(e) => onChange({ description: e.target.value })}
        />
      </div>
      <div className="grid gap-2">
        <Label>Виды транспорта</Label>
        <div className="flex flex-wrap gap-2">
          {TRANSPORT_TYPES.map((t) => {
            const active = form.modes.includes(t)
            return (
              <Button
                key={t}
                type="button"
                size="sm"
                variant={active ? 'default' : 'outline'}
                onClick={() =>
                  onChange({
                    modes: active ? form.modes.filter((m) => m !== t) : [...form.modes, t],
                  })
                }
              >
                {t}
              </Button>
            )
          })}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="grid gap-2">
          <Label htmlFor="opt-price">Цена клиенту</Label>
          <Input
            id="opt-price"
            inputMode="decimal"
            placeholder="150000"
            value={form.price}
            onChange={(e) => onChange({ price: e.target.value })}
          />
        </div>
        <div className="grid gap-2">
          <Label>Валюта</Label>
          <ReferenceCombobox
            dir="currency"
            value={form.currency}
            onPick={(pick: RefPick) => onChange({ currency: pick && pick.code ? pick.code : 'RUB' })}
            placeholder="Например: Рубли"
          />
        </div>
        <div className="grid gap-2">
          <Label>НДС</Label>
          <Select value={form.vatMode} onValueChange={(v) => onChange({ vatMode: v })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {VAT_MODES.map((v) => (
                <SelectItem key={v} value={v}>
                  {VAT_MODE_LABELS[v]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="grid gap-2">
          <Label htmlFor="opt-cost">Себестоимость</Label>
          <Input
            id="opt-cost"
            inputMode="decimal"
            placeholder="не обязательно"
            value={form.cost}
            onChange={(e) => onChange({ cost: e.target.value })}
          />
        </div>
        <div className="grid gap-2">
          <Label>Валюта себест.</Label>
          <ReferenceCombobox
            dir="currency"
            value={form.costCurrency}
            onPick={(pick: RefPick) => onChange({ costCurrency: pick && pick.code ? pick.code : 'RUB' })}
            placeholder="Например: Рубли"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="opt-eta">Срок, дней</Label>
          <Input
            id="opt-eta"
            inputMode="numeric"
            placeholder="12"
            value={form.etaDays}
            onChange={(e) => onChange({ etaDays: e.target.value })}
          />
        </div>
      </div>
      <div className="grid gap-2">
        <Label>Ориентир</Label>
        <Select value={form.priorityFit} onValueChange={(v) => onChange({ priorityFit: v })}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {QUOTE_PRIORITY_FITS.map((f) => (
              <SelectItem key={f} value={f}>
                {QUOTE_PRIORITY_FIT_LABELS[f]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
