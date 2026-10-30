'use client'

import { Plus, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { isManualRate } from '@/lib/brokers'
import { HsCodeCombobox, type HsPick } from '@/components/references/HsCodeCombobox'

// ─── DF-18: редактор строк ответа брокера («код · пошлина % · доп. % · НДС %»)
// Часть BrokerEstimateForm (вынесена по RULES 2.14 — файл ≤ 300 строк):
// добавление строк «+ Код», поиск кода по справочнику DF-17C с допуском
// ручного кода (allowManual), три процента и пометки в строке. Чистый
// controlled-компонент: владелец состояния — форма, отсюда onChange.

// Строка формы: код + имя из справочника (для показа) + проценты текстом
// (конвертация в число — на сохранении, parsePercentInput).
export type ItemForm = {
  code: string
  codeName: string
  duty: string
  addDuty: string
  addDutyNote: string
  vat: string
  rateNote: string
}

export const EMPTY_ITEM: ItemForm = {
  code: '',
  codeName: '',
  duty: '',
  addDuty: '',
  addDutyNote: '',
  vat: '',
  rateNote: '',
}

// Проценты в поле ввода: строка → число или null (пусто = «нет»).
// 0..100, до 2 знаков — та же логика, что валидатор сервера (percentValue).
export const parsePercentInput = (raw: string): number | null | 'invalid' => {
  const v = raw.trim().replace(',', '.')
  if (!v) return null
  const n = Number(v)
  if (!Number.isFinite(n) || n < 0 || n > 100) return 'invalid'
  if (Math.abs(n * 100 - Math.round(n * 100)) > 1e-6) return 'invalid'
  return n
}

export function EstimateItemsEditor({
  items,
  disabled,
  onChange,
}: {
  items: ItemForm[]
  disabled: boolean
  onChange: (items: ItemForm[]) => void
}) {
  const setItem = (idx: number, patch: Partial<ItemForm>) =>
    onChange(items.map((it, i) => (i === idx ? { ...it, ...patch } : it)))

  const pickHs = (idx: number, pick: HsPick | null) => {
    if (!pick) {
      setItem(idx, { code: '', codeName: '' })
      return
    }
    setItem(idx, { code: pick.code, codeName: pick.name })
  }

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between">
        <Label>Коды ТН ВЭД и проценты</Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange([...items, { ...EMPTY_ITEM }])}
          disabled={disabled}
        >
          <Plus className="size-4" />
          Код
        </Button>
      </div>
      {items.length === 0 && (
        <span className="text-xs text-muted-foreground">
          Строк нет — нажмите «Код» и найдите позицию в справочнике (по коду или названию, за три символа)
        </span>
      )}
      {items.map((it, idx) => (
        <div key={idx} className="rounded-lg border p-3 grid gap-2 bg-card">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">Строка {idx + 1}</span>
            {isManualRate(it) && (
              <Badge variant="outline" className="text-xs">
                ручной расчёт
              </Badge>
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="ml-auto h-7 px-2 text-destructive hover:text-destructive"
              onClick={() => onChange(items.filter((_, i) => i !== idx))}
              disabled={disabled}
              title="Убрать строку"
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
          <HsCodeCombobox
            label="Код ТН ВЭД"
            value={it.code}
            valueName={it.codeName || undefined}
            onPick={(pick) => pickHs(idx, pick)}
            disabled={disabled}
            allowManual
          />
          <div className="grid grid-cols-3 gap-2">
            <div className="grid gap-1">
              <Label htmlFor={`duty-${idx}`} className="text-xs text-muted-foreground">
                Пошлина, %
              </Label>
              <Input
                id={`duty-${idx}`}
                inputMode="decimal"
                placeholder="5"
                value={it.duty}
                onChange={(e) => setItem(idx, { duty: e.target.value })}
                disabled={disabled}
                className="h-8"
              />
            </div>
            <div className="grid gap-1">
              <Label htmlFor={`addduty-${idx}`} className="text-xs text-muted-foreground">
                Доп. пошлина, %
              </Label>
              <Input
                id={`addduty-${idx}`}
                inputMode="decimal"
                placeholder="пусто — нет"
                value={it.addDuty}
                onChange={(e) => setItem(idx, { addDuty: e.target.value })}
                disabled={disabled}
                className="h-8"
              />
            </div>
            <div className="grid gap-1">
              <Label htmlFor={`vat-${idx}`} className="text-xs text-muted-foreground">
                НДС, %
              </Label>
              <Input
                id={`vat-${idx}`}
                inputMode="decimal"
                placeholder="20"
                value={it.vat}
                onChange={(e) => setItem(idx, { vat: e.target.value })}
                disabled={disabled}
                className="h-8"
              />
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Input
              aria-label="Вид дополнительной пошлины"
              placeholder="антидемпинговая…"
              value={it.addDutyNote}
              onChange={(e) => setItem(idx, { addDutyNote: e.target.value })}
              disabled={disabled}
              className="h-8"
            />
            <Input
              aria-label="Нестандартная ставка"
              placeholder="нестандартная ставка: 2 €/кг…"
              value={it.rateNote}
              onChange={(e) => setItem(idx, { rateNote: e.target.value })}
              disabled={disabled}
              className="h-8"
            />
          </div>
        </div>
      ))}
    </div>
  )
}
