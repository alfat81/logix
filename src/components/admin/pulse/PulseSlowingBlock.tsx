'use client'

import Link from 'next/link'
import { Hourglass } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { HiddenMore } from '../HiddenMore'
import { WAITING_REASON_LABELS, type WaitingReason } from '@/lib/waiting'
import { PULSE_KIND_TITLES } from '@/lib/pulse'
import { daysWord, hoursWord } from '../attention/types'
import type { SlowingGroup } from './types'

// ─── DF-07, блок 3 «Кто тормозит» ────────────────────────────────────
// Группировка активных заявок по waitingOnKind (DF-05): число заявок и
// самое старое waitingSince, раскрытие до списка заявок (нутативный
// <details> — на телефоне раскрывается одним касанием, состояния нет).
//
// Брендбук (D40): нейтральные тона — красный сигнал оставлен секции
// «Ждут дольше N часов» на «Требует внимания»; здесь возраст мяча
// подписан текстом, шум не множится.

function ageLabel(sinceIso: string): string {
  const hours = Math.max(0, Math.floor((new Date().getTime() - new Date(sinceIso).getTime()) / 3_600_000))
  return hours < 24 ? `${hours} ${hoursWord(hours)}` : `${Math.floor(hours / 24)} ${daysWord(Math.floor(hours / 24))}`
}

export function PulseSlowingBlock({ groups }: { groups: SlowingGroup[] }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Hourglass className="size-4 text-muted-foreground" />
          Кто тормозит
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Мяч по заявкам (DF-05): у кого и как давно; касание раскрывает список
        </p>
      </CardHeader>
      <CardContent className="grid gap-2">
        {groups.length === 0 && (
          <p className="text-sm text-muted-foreground py-2">Мяч ни у кого не висит</p>
        )}
        {groups.map((g) => (
          <details key={g.kind} className="rounded-md border">
            <summary className="flex flex-wrap items-center gap-x-3 gap-y-1 p-3 cursor-pointer select-none hover:bg-accent/40 rounded-md">
              <span className="font-medium">{PULSE_KIND_TITLES[g.kind]}</span>
              <Badge variant="outline" className="bg-muted/40 text-muted-foreground border-border">
                {g.count}
              </Badge>
              <span className="text-xs text-muted-foreground ml-auto tabular-nums">
                старее {ageLabel(g.oldestSince)}
              </span>
            </summary>
            <ol className="px-3 pb-3 pt-1">
              {g.orders.map((o, i) => (
                <li key={o.orderId} className={i > 0 ? 'border-t border-border/60' : ''}>
                  <Link
                    href={`/admin/orders/${o.orderId}`}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 hover:bg-accent/40 rounded-md px-1"
                  >
                    <span className="font-mono font-semibold text-sm min-w-16">{o.number}</span>
                    <span className="text-sm min-w-32 flex-1">{o.customerName}</span>
                    <span className="text-xs text-muted-foreground">
                      {o.waitingReason
                        ? (WAITING_REASON_LABELS[o.waitingReason as WaitingReason] ?? o.waitingReason)
                        : '—'}
                    </span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {ageLabel(o.waitingSince)}
                    </span>
                  </Link>
                </li>
              ))}
              {g.hiddenCount > 0 && <HiddenMore hidden={g.hiddenCount} />}
            </ol>
          </details>
        ))}
      </CardContent>
    </Card>
  )
}
