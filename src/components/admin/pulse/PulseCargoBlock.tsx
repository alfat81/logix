'use client'

import Link from 'next/link'
import { Truck } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { HiddenMore } from '../HiddenMore'
import { ORDER_STATUS_LABELS, STAGE_STATUS_LABELS } from '@/lib/order-constants'
import { fmtDate } from '../attention/types'
import type { PulseCargoRow } from './types'

// ─── DF-07, блок 2 «Где груз» ────────────────────────────────────────
// Активные заявки: текущий (ближайший незавершённый) этап, исполнитель
// этапа — перевозчик (глоссарий RULES 2.6), ETA и просрочка. Семантика
// строки — та же, что в списке заявок Ж4 (summarizeOrderStages). Срез
// лимитом, счётчик полный — «и ещё N» ведёт в список.

export function PulseCargoBlock({
  rows,
  total,
}: {
  rows: PulseCargoRow[]
  total: number
}) {
  const hidden = total - rows.length
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Truck className="size-4 text-muted-foreground" />
          Где груз
          <Badge variant="outline" className="bg-muted/40 text-muted-foreground border-border">
            {total}
          </Badge>
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Активные заявки: ближайший этап, перевозчик, ожидаемая дата
        </p>
      </CardHeader>
      <CardContent className="grid gap-2">
        {total === 0 && (
          <p className="text-sm text-muted-foreground py-2">Активных заявок нет</p>
        )}
        {rows.map((r) => (
          <Link
            key={r.orderId}
            href={`/admin/orders/${r.orderId}`}
            className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border p-3 transition-colors hover:border-ring"
          >
            <span className="font-mono font-semibold min-w-20">{r.number}</span>
            <span className="min-w-40 flex-1">
              <span className="font-medium">{r.customerName}</span>
              <span className="text-xs text-muted-foreground block">
                {r.nearestStageName ?? 'Этапы не заданы'}
                {r.nearestStageStatus
                  ? ` · ${STAGE_STATUS_LABELS[r.nearestStageStatus as keyof typeof STAGE_STATUS_LABELS] ?? r.nearestStageStatus}`
                  : ''}
                {r.contractorName ? ` · ${r.contractorName}` : ''}
              </span>
            </span>
            {r.eta && (
              <span className="text-xs text-muted-foreground tabular-nums">ETA: {fmtDate(r.eta)}</span>
            )}
            {r.overdue && (
              <Badge variant="destructive">просрочка</Badge>
            )}
            <Badge variant="outline" className="text-xs text-muted-foreground">
              {ORDER_STATUS_LABELS[r.status] ?? r.status}
            </Badge>
          </Link>
        ))}
        <HiddenMore hidden={hidden} />
      </CardContent>
    </Card>
  )
}
