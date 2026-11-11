'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  OPTION_REVISION_KIND_LABELS,
  type OptionRevisionKind,
} from '@/lib/option-revisions'
import { fmtDate } from '@/components/admin/lead/types'

// ─── DF-27 волна 1: «История варианта» (план §10.4) ─────────────────
// Разворачиваемый список ревизий карточки варианта: дата, автор, вид
// (создан/изменён/заполнен из запроса/пересмотр цены), перечень
// изменений человекочитаемо. Данные — GET /api/admin/options/[id]
// (staff-проекция; клиенту ревизии не отдаются — D3).

export type RevisionRow = {
  id: string
  seq: number
  kind: string
  actorName: string
  changedFields: Record<string, { from: unknown; to: unknown }> | null
  createdAt: string
}

function fmtValue(v: unknown): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'boolean') return v ? 'Да' : 'Нет'
  if (typeof v === 'object') return '…'
  const s = String(v).trim()
  return s || '—'
}

export function QuoteOptionHistory({ optionId, open }: { optionId: string; open: boolean }) {
  const [rows, setRows] = useState<RevisionRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || rows || error) return
    let alive = true
    fetch(`/api/admin/options/${optionId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Не удалось загрузить историю'))))
      .then((d) => {
        if (alive) setRows((d.revisions ?? []) as RevisionRow[])
      })
      .catch((e: unknown) => {
        if (alive) setError(e instanceof Error ? e.message : 'Ошибка')
      })
    return () => {
      alive = false
    }
  }, [open, optionId, rows, error])

  if (!open) return null
  if (error) return <div className="text-sm text-destructive">{error}</div>
  if (!rows) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-3 animate-spin" /> Загрузка истории…
      </div>
    )
  }
  if (rows.length === 0) {
    return <div className="text-sm text-muted-foreground">Правок пока нет</div>
  }
  return (
    <div className="grid gap-1.5">
      {rows.map((r) => {
        const kindLabel =
          OPTION_REVISION_KIND_LABELS[r.kind as OptionRevisionKind] ?? r.kind
        const changed = r.changedFields
          ? Object.entries(r.changedFields)
              .map(([key, { from, to }]) => `${key}: ${fmtValue(from)} → ${fmtValue(to)}`)
              .join('; ')
          : ''
        return (
          <div key={r.id} className="rounded-md border p-2 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground tabular-nums">
                №{r.seq} · {fmtDate(r.createdAt)}
              </span>
              <span className="font-medium">{kindLabel}</span>
              <span className="text-xs text-muted-foreground">{r.actorName}</span>
            </div>
            {changed && <div className="mt-1 text-xs text-muted-foreground">{changed}</div>}
          </div>
        )
      })}
    </div>
  )
}

// Кнопка-переключатель истории — рядом с правкой варианта
export function HistoryToggle({
  open,
  onToggle,
}: {
  open: boolean
  onToggle: () => void
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onToggle}
      aria-expanded={open}
    >
      {open ? 'Скрыть историю' : 'История варианта'}
    </Button>
  )
}
