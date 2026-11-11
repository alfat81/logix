'use client'

import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Loader2 } from 'lucide-react'
import { readApiResponse } from '@/lib/api-client'

// ─── DF-27 волна 2 (Р-5, D75): история таможенных расчётов — брокер ──
// Полная история версий расчёта сделки (текущая сверху, isCurrent-бейдж,
// происхождение origin='carried_from_lead' — «перенесён с запроса»).
// Историю видят менеджер и брокер; клиенту отдаётся только актуальный
// результат. Варианты расчёта, себестоимость и маржа брокеру не
// открываются (D3/§10.5 техплана) — расчёты их не содержат.

type CustomsRow = {
  id: string
  calcDate: string
  fxDate: string
  isCurrent: boolean
  origin?: string | null
  createdByName: string
  createdAt: string
  totals: { paymentsTotal?: string | number; grandTotal?: string | number }
  items: Array<{ hsCode: string; netWeightKg: string | number }>
}

const fmtDate = (iso: string): string => new Date(iso).toLocaleDateString('ru-RU')

export function BrokerCustomsHistory({ leadId }: { leadId: string }) {
  const [rows, setRows] = useState<CustomsRow[] | null>(null)

  const load = useCallback(async () => {
    const res = await fetch(`/api/broker/leads/${leadId}/customs-calculations`)
    if (!res.ok) {
      setRows([])
      return
    }
    const data = await readApiResponse<{ calculations?: CustomsRow[] }>(res)
    setRows(data.calculations ?? [])
  }, [leadId])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">История таможенных расчётов</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {rows === null ? (
          <div className="flex items-center gap-2 text-muted-foreground py-2">
            <Loader2 className="size-4 animate-spin" /> Загрузка…
          </div>
        ) : rows.length === 0 ? (
          <p className="text-muted-foreground">Расчётов пока нет — менеджер считает на основе вашей оценки.</p>
        ) : (
          rows.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border px-3 py-2">
              <span className="font-medium tabular-nums">{fmtDate(c.calcDate)}</span>
              {c.isCurrent && <Badge variant="review">актуальная версия</Badge>}
              {c.origin === 'carried_from_lead' && <Badge variant="version">перенесён с запроса</Badge>}
              <span className="text-muted-foreground">
                ТН ВЭД: {c.items.map((i) => i.hsCode).join(', ') || '—'}
              </span>
              <span className="ml-auto tabular-nums">
                платежи: {c.totals?.paymentsTotal ?? '—'} ₽
              </span>
              <span className="text-xs text-muted-foreground">{c.createdByName}</span>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  )
}
