'use client'

import type { ReactNode } from 'react'
import { Check } from 'lucide-react'

// ─── Общая строка списка для комбобоксов справочников ───────────────
// Используют ReferenceCombobox (DF-17) и HsCodeCombobox (DF-17C):
// role="option", выбор по mousedown (до blur родителя — иначе клик
// теряется), подсветка активной строки, галочка выбранного. Дубликат
// блока ловит IC-14 — правки вносить только здесь.
export function ComboOptionRow({
  code,
  codeClassName = 'w-12',
  name,
  trailing,
  selected,
  active,
  onPick,
}: {
  // Код записи (моно-колонка слева)
  code: string
  // Ширина колонки кода: w-12 у коротких кодов DF-17, w-24 у 10-значных ТН ВЭД
  codeClassName?: string
  name: string
  // Хвост строки (подсказка ЕТТ у HsCodeCombobox); рендерится перед
  // галочкой — галочка прижимается к ней, а не к краю
  trailing?: ReactNode
  selected: boolean
  active: boolean
  onPick: () => void
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onMouseDown={(e) => {
        // mousedown: до blur родителя — иначе клик теряется
        e.preventDefault()
        onPick()
      }}
      className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm ${
        active ? 'bg-accent/60' : ''
      }`}
    >
      <span className={`${codeClassName} shrink-0 font-mono text-xs text-muted-foreground`}>
        {code}
      </span>
      <span className="truncate">{name}</span>
      {trailing}
      {selected && (
        <Check className={`${trailing ? 'ml-1' : 'ml-auto'} size-4 shrink-0 text-action-icon`} />
      )}
    </button>
  )
}
