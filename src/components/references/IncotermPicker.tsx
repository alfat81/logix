'use client'

import { useEffect, useMemo, useState } from 'react'
import { ReferenceCombobox, type RefPick } from '@/components/references/ReferenceCombobox'
import {
  incotermMetaOf,
  PLACE_KIND_LABELS,
  INCOTERM_TRANSPORT_LABELS,
} from '@/lib/ref'

// ─── DF-17: выбор условия поставки с разъяснением ───────────────────
// Combobox по справочнику + панель разъяснения рядом (карточка DF-17:
// «разъяснение показывается рядом с выбором, в том числе в форме
// запроса клиента»). Разъяснения — СОБСТВЕННЫЕ формулировки (тексты
// ICC не копируются), правила для таможенной стоимости — данные в meta
// с пометкой «черновик до утверждения брокером» (O-12).

type IncotermItem = {
  id: string
  code: string
  name: string
  nameEn: string | null
  meta: unknown
}

export function IncotermPicker({
  value,
  onPick,
  label = 'Условия поставки (Инкотермс)',
}: {
  value: string
  onPick: (pick: RefPick) => void
  label?: string
}) {
  const [items, setItems] = useState<IncotermItem[] | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/ref/incoterm')
      .then(async (res) => {
        const body = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(body.error || 'Справочник недоступен')
        if (!cancelled) setItems(body.items ?? [])
      })
      .catch(() => {
        if (!cancelled) setItems([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  const meta = useMemo(() => {
    if (!items || !value) return null
    const item = items.find((i) => i.code === value)
    return item ? incotermMetaOf(item.meta) : null
  }, [items, value])

  return (
    <div className="grid gap-1.5">
      <ReferenceCombobox
        dir="incoterm"
        value={value}
        onPick={onPick}
        label={label}
        placeholder="Например: FOB — не обязательно"
      />
      {meta && (
        <div className="rounded-md border bg-muted/40 p-3 text-xs grid gap-1">
          <div className="font-medium">
            {value} · {PLACE_KIND_LABELS[meta.placeKind]}
          </div>
          <div className="text-muted-foreground">{meta.explanation}</div>
          <div className="text-muted-foreground">
            Транспорт: {meta.transport.map((t) => INCOTERM_TRANSPORT_LABELS[t] ?? t).join(', ')}.
            {meta.addFreightToArrival && ' Фрахт до места прибытия добавляется к стоимости груза.'}
            {meta.addInsurance && ' Страхование добавляется к стоимости груза.'}
            {meta.deductPostArrival && ' Расходы после места прибытия вычитаются из стоимости.'}
          </div>
          {meta.warning && <div className="text-destructive">{meta.warning}</div>}
          {meta.draft && (
            <div className="text-muted-foreground italic">
              Правила расчёта — черновик: до утверждения брокером (O-12) расчёт их не применяет.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
