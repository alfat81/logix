'use client'

import { CheckCheck, Hourglass, ListTodo } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import type { BrokerQueueCounters } from './queue'

// TU-01.8 (волна 4): три сводные карточки портала брокера (референс
// brockercabinet.png). Значения — реальные счётчики из уже загруженных
// списков (queueCounters, единая точка правды — без отдельных API):
// «Ожидают расчёта» — запросы без оценки платежей, «В работе» — заявки
// в ORDER_ACTIVE_STATUSES, «Завершено» — заявки completed. Демо-метрики
// макета («завершено сегодня», «среднее время (мин)») не переносятся —
// в системе нет измерения времени расчёта (Д-24); без данных — 0.
export type BrokerSummaryCardsProps = {
  loading: boolean
  counters: BrokerQueueCounters
}

export function BrokerSummaryCards({ loading, counters }: BrokerSummaryCardsProps) {
  const items = [
    { icon: Hourglass, label: 'Ожидают расчёта', value: counters.awaiting, accent: true },
    { icon: ListTodo, label: 'В работе', value: counters.inWork, accent: false },
    { icon: CheckCheck, label: 'Завершено', value: counters.completed, accent: false },
  ]

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {items.map((it) => (
        <Card key={it.label} className="p-6">
          <CardContent className="p-0">
            <div className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className="flex size-9 shrink-0 items-center justify-center rounded-md bg-accent/10"
              >
                <it.icon className="size-4 text-accent-text" />
              </span>
              <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                {it.label}
              </div>
            </div>
            {loading ? (
              <div className="mt-3 text-4xl font-bold tracking-tight text-muted-foreground">…</div>
            ) : (
              <div
                className={`mt-3 text-4xl font-bold tracking-tight ${it.accent ? 'text-accent-text' : ''}`}
              >
                {it.value}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
