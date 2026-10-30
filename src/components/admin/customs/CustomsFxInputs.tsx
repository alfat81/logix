'use client'

import { Input } from '@/components/ui/input'

// ─── DF-19: ручные курсы за единицу валюты ───────────────────────────
// Курс ЦБ из справочника подставляется сервером автоматически; вручную
// менеджер вводит курс, когда импорта на нужную дату нет (например,
// курс на дату регистрации ДТ из самой декларации — D41). Значения —
// по одному полю на каждую валюту, реально используемую в расчёте
// (кроме RUB: он всегда 1:1).

export function CustomsFxInputs({
  usedCurrencies,
  values,
  onChange,
  disabled,
  compact,
}: {
  usedCurrencies: string[]
  values: Record<string, string>
  onChange: (code: string, value: string) => void
  disabled?: boolean
  // DF-21: режим панели 320px — в одну колонку
  compact?: boolean
}) {
  if (usedCurrencies.length === 0) return null
  return (
    <div className="grid gap-2">
      <span className="text-sm font-medium">
        Курсы вручную за единицу (пусто — курс ЦБ из справочника)
      </span>
      <div className={compact ? 'grid gap-2' : 'grid gap-2 sm:grid-cols-3'}>
        {usedCurrencies.map((code) => (
          <label key={code} className="grid gap-1.5">
            <span className="text-sm">{code}</span>
            <Input
              inputMode="decimal"
              value={values[code] ?? ''}
              disabled={disabled}
              onChange={(e) => onChange(code, e.target.value)}
              placeholder="80,9604"
            />
          </label>
        ))}
      </div>
    </div>
  )
}
