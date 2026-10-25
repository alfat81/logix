'use client'

import { TRANSPORT_TYPES } from '@/lib/leads'

// v0.5.0 (P1-22): чипы видов транспорта — выезд из
// ContractorLeadsSection.tsx (резка под лимит 300, RULES 2.14).
// Общий редактор воронки и пула: значения — TRANSPORT_TYPES из
// lib/leads.ts (очередь Г5); выбранные подсвечены, точка расширения
// допусков — Phase 2 (роадмап 6).
export function TransportChips({
  selected,
  onToggle,
}: {
  selected: string[]
  onToggle: (v: string) => void
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {TRANSPORT_TYPES.map((t) => {
        const on = selected.includes(t)
        return (
          <button
            key={t}
            type="button"
            onClick={() => onToggle(t)}
            className={
              'rounded-full border px-2.5 py-1 text-xs transition-colors ' +
              (on
                ? 'border-transparent bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:border-ring hover:text-foreground')
            }
          >
            {t}
          </button>
        )
      })}
    </div>
  )
}
