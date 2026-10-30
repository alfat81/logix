'use client'

import { Label } from '@/components/ui/label'

// DF-19 (D40): выбор метода распределения фрахта и прочих расходов между
// строками кода ТН ВЭД. Базовые правила ДТС-1: перевозка — по весу нетто,
// прочие расходы — по стоимости; менеджер может переопределить (вынос из
// CustomsCalcForm, fix2 — RULES 2.14). Показ блока решает форма: только
// при нескольких строках кода.

export function CustomsAllocationSelects({
  freight,
  other,
  onFreight,
  onOther,
  compact,
}: {
  freight: 'weight' | 'value'
  other: 'weight' | 'value'
  onFreight: (m: 'weight' | 'value') => void
  onOther: (m: 'weight' | 'value') => void
  // DF-21: режим панели 320px — в одну колонку
  compact?: boolean
}) {
  return (
    <div className={compact ? 'grid gap-2' : 'grid gap-2 sm:grid-cols-2'}>
      <Label className="grid gap-1.5">
        <span className="text-sm">Распределение перевозки</span>
        <select
          aria-label="Метод распределения перевозки"
          className="h-9 rounded-md border bg-background px-2 text-sm"
          value={freight}
          onChange={(e) => onFreight(e.target.value === 'value' ? 'value' : 'weight')}
        >
          <option value="weight">по весу нетто (ДТС-1)</option>
          <option value="value">по стоимости</option>
        </select>
      </Label>
      <Label className="grid gap-1.5">
        <span className="text-sm">Распределение прочих расходов</span>
        <select
          aria-label="Метод распределения прочих расходов"
          className="h-9 rounded-md border bg-background px-2 text-sm"
          value={other}
          onChange={(e) => onOther(e.target.value === 'weight' ? 'weight' : 'value')}
        >
          <option value="value">по стоимости (ДТС-1)</option>
          <option value="weight">по весу нетто</option>
        </select>
      </Label>
    </div>
  )
}
