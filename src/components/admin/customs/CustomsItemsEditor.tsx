'use client'

import { Plus, Trash2, ClipboardList } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { HsCodeCombobox } from '@/components/references/HsCodeCombobox'
import type { EstimatePrefill, FormItem } from './types'

// ─── DF-19: редактор строк расчёта по кодам ТН ВЭД (RULES 2.14 —
// вынесен из формы; паттерн estimate/ItemsEditor DF-18). Строки —
// редактируемый черновик (D40): стоимость/вес/проценты правятся
// свободно; проценты предзаполняются из ответа брокера.

const num = (v: string): string => v.replace(',', '.')

export function CustomsItemsEditor({
  rows,
  onChange,
  currencyOptions,
  estimates,
  disabled,
}: {
  rows: FormItem[]
  onChange: (rows: FormItem[]) => void
  currencyOptions: { code: string; name: string }[]
  estimates: EstimatePrefill[]
  disabled?: boolean
}) {
  const patch = (i: number, p: Partial<FormItem>): void =>
    onChange(rows.map((r, idx) => (idx === i ? { ...r, ...p } : r)))

  const addRow = (): void =>
    onChange([
      ...rows,
      {
        brokerItemId: null,
        hsCode: '',
        goodsValue: '',
        goodsCurrency: 'USD',
        netWeightKg: '',
        dutyPercent: '',
        addDutyPercent: '',
        vatPercent: '',
      },
    ])

  const removeRow = (i: number): void => onChange(rows.filter((_, idx) => idx !== i))

  // Предзаполнение из последнего ответа брокера (DF-18 → DF-19):
  // проценты по кодам; стоимость/вес вносит менеджер. Ставка-строка
  // (rateNote) не переносится в автоматический расчёт — код приходит
  // пустым по процентам, менеджер считает вручную или ставит проценты.
  const prefillFromBroker = (): void => {
    const sent = [...estimates]
      .sort((a, b) => (b.sentAt ?? b.updatedAt).localeCompare(a.sentAt ?? a.updatedAt))
      .find((e) => e.items.length > 0)
    if (!sent) return
    onChange(
      sent.items.map((it) => ({
        brokerItemId: it.id,
        hsCode: it.hsCode,
        goodsValue: '',
        goodsCurrency: 'USD',
        netWeightKg: '',
        dutyPercent: it.dutyPercent == null ? '' : String(it.dutyPercent),
        addDutyPercent: it.addDutyPercent == null ? '' : String(it.addDutyPercent),
        vatPercent: it.vatPercent == null ? '' : String(it.vatPercent),
      }))
    )
  }

  const hasBrokerItems = estimates.some((e) => e.items.length > 0)
  const currencySelect = (
    value: string,
    on: (v: string) => void,
    idx: number
  ): React.ReactNode => (
    <select
      aria-label={`Валюта позиции ${idx + 1}`}
      className="h-8 rounded-md border bg-background px-1.5 text-xs"
      value={value}
      disabled={disabled}
      onChange={(e) => on(e.target.value)}
    >
      {currencyOptions.map((c) => (
        <option key={c.code} value={c.code}>
          {c.code}
        </option>
      ))}
    </select>
  )

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">Строки по кодам ТН ВЭД</span>
        {hasBrokerItems && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7"
            disabled={disabled}
            onClick={prefillFromBroker}
            title="Проценты из последнего ответа брокера (DF-18)"
          >
            <ClipboardList className="size-3.5" />
            Из ответа брокера
          </Button>
        )}
        <Button type="button" variant="outline" size="sm" className="h-7 ml-auto" disabled={disabled} onClick={addRow}>
          <Plus className="size-3.5" />
          Код
        </Button>
      </div>

      {rows.length === 0 && (
        <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
          Добавьте коды ТН ВЭД из ответа брокера или вручную — по каждой строке нужна стоимость товара и вес нетто (гр. 38)
        </div>
      )}

      {rows.map((row, i) => (
        <div key={i} className="rounded-md border p-2.5 grid gap-2">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <HsCodeCombobox
                value={row.hsCode}
                valueName={row.hsName}
                allowManual
                label={`Код ТН ВЭД, строка ${i + 1}`}
                onPick={(pick) =>
                  patch(i, pick ? { hsCode: pick.code, hsName: pick.name } : { hsCode: '', hsName: undefined })
                }
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-destructive hover:text-destructive"
              disabled={disabled}
              aria-label={`Удалить строку ${i + 1}`}
              onClick={() => removeRow(i)}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
          {row.hsName && (
            <div className="text-xs text-muted-foreground truncate">
              {row.hsCode} · {row.hsName}
            </div>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            <label className="grid gap-1 text-xs">
              <span className="text-muted-foreground">Стоимость товара</span>
              <div className="flex gap-1">
                <Input
                  className="h-8 text-xs"
                  inputMode="decimal"
                  value={row.goodsValue}
                  disabled={disabled}
                  onChange={(e) => patch(i, { goodsValue: e.target.value })}
                  placeholder="39000"
                />
                {currencySelect(row.goodsCurrency, (v) => patch(i, { goodsCurrency: v }), i)}
              </div>
            </label>
            <label className="grid gap-1 text-xs">
              <span className="text-muted-foreground">Вес нетто, кг (гр. 38)</span>
              <Input
                className="h-8 text-xs"
                inputMode="decimal"
                value={row.netWeightKg}
                disabled={disabled}
                onChange={(e) => patch(i, { netWeightKg: e.target.value })}
                placeholder="0,000"
              />
            </label>
            <label className="grid gap-1 text-xs">
              <span className="text-muted-foreground">Пошлина, %</span>
              <Input
                className="h-8 text-xs"
                inputMode="decimal"
                value={row.dutyPercent}
                disabled={disabled}
                onChange={(e) => patch(i, { dutyPercent: e.target.value })}
                placeholder="—"
              />
            </label>
            <label className="grid gap-1 text-xs">
              <span className="text-muted-foreground">Доп. пошлина, %</span>
              <Input
                className="h-8 text-xs"
                inputMode="decimal"
                value={row.addDutyPercent}
                disabled={disabled}
                onChange={(e) => patch(i, { addDutyPercent: e.target.value })}
                placeholder="—"
              />
            </label>
            <label className="grid gap-1 text-xs">
              <span className="text-muted-foreground">НДС, %</span>
              <Input
                className="h-8 text-xs"
                inputMode="decimal"
                value={row.vatPercent}
                disabled={disabled}
                onChange={(e) => patch(i, { vatPercent: e.target.value })}
                placeholder="22"
              />
            </label>
            <div className="flex items-end">
              {row.brokerItemId && (
                <Badge variant="outline" className="text-xxs">
                  из ответа брокера
                </Badge>
              )}
            </div>
          </div>
        </div>
      ))}
      {rows.length > 0 && rows.some((r) => !r.hsCode || !num(r.goodsValue) || !num(r.netWeightKg)) && (
        <div className="text-xs text-muted-foreground">
          Для расчёта каждой строке нужны код, стоимость и вес нетто — пустые строки сервер отклонит
        </div>
      )}
    </div>
  )
}
