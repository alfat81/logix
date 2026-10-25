'use client'

import { Badge } from '@/components/ui/badge'
import { CONTRACTOR_RAW_INFO_LABELS, readTransportChips } from '@/lib/contractors'

// v0.5.0 (P1-22): анкета rawInfo кандидата — выезд из
// ContractorLeadsSection.tsx (резка под лимит 300, RULES 2.14).
// Известные ключи — с метками, чужие — как есть; чужие массивы
// строкой не рендерим.
export function RawInfoView({ rawInfo }: { rawInfo: Record<string, unknown> | null }) {
  if (!rawInfo || Object.keys(rawInfo).length === 0) {
    return <div className="text-sm text-muted-foreground">Анкета не заполнена</div>
  }
  const known = new Set(Object.keys(CONTRACTOR_RAW_INFO_LABELS))
  const entries = Object.entries(rawInfo)
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {entries.map(([k, v]) => {
        if (k === 'transportTypes') {
          const chips = readTransportChips(v)
          return (
            <div key={k} className="grid gap-1">
              <span className="text-xs text-muted-foreground">{CONTRACTOR_RAW_INFO_LABELS[k]}</span>
              {chips.length ? (
                <div className="flex flex-wrap gap-1">
                  {chips.map((t) => (
                    <Badge key={t} variant="outline" className="text-xxs">
                      {t}
                    </Badge>
                  ))}
                </div>
              ) : (
                <span className="text-sm">—</span>
              )}
            </div>
          )
        }
        if (Array.isArray(v)) return null // чужие массивы не рендерим строкой
        const str = typeof v === 'string' && v.trim() ? v : typeof v === 'number' ? String(v) : ''
        return (
          <div key={k} className="grid gap-1">
            <span className="text-xs text-muted-foreground">
              {known.has(k) ? CONTRACTOR_RAW_INFO_LABELS[k] : k}
            </span>
            <span className="text-sm">{str || '—'}</span>
          </div>
        )
      })}
    </div>
  )
}
