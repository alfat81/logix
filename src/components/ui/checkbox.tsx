'use client'

import * as React from 'react'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Чекбокс (DF-26: выбор строк реестра для «Скачать выбранные») ────
// Без новых зависимостей (RULES): собственный примитив на кнопке с
// role="checkbox" — клавиатура (Space), aria-checked, стили токенов
// (primary/ successful заливка как у статуса «ФИНАЛЬНЫЙ» §3.2).

export function Checkbox({
  className,
  checked,
  onCheckedChange,
  ...props
}: Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onChange' | 'onCheckedChange'> & {
  checked?: boolean
  onCheckedChange?: (checked: boolean) => void
}) {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    // Кнопка и так реагирует на Space/Enter — пробел не скроллит страницу
    if (e.key === ' ') e.preventDefault()
  }
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked ?? false}
      data-state={checked ? 'checked' : 'unchecked'}
      onKeyDown={handleKeyDown}
      onClick={() => onCheckedChange?.(!checked)}
      className={cn(
        'peer size-4 shrink-0 rounded-[4px] border border-input bg-background flex items-center justify-center transition-colors',
        'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50',
        checked && 'bg-primary text-primary-foreground border-primary',
        className,
      )}
      {...props}
    >
      {checked && <Check className="size-3" aria-hidden />}
    </button>
  )
}
