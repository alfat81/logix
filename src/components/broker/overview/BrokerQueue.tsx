'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Archive, ClipboardList, Search, SearchX } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { EmptyState } from '@/components/states/empty-state'
import { LoadingState } from '@/components/states/loading-state'
import {
  BrokerLeadStatusBadge,
  BrokerOrderStatusBadge,
} from '@/components/broker/BrokerBadges'
import type { OrderStatus } from '@/lib/order-constants'
import type { LeadStatus } from '@/lib/leads'
import { filterQueue, type BrokerQueueRow, type BrokerQueueTab } from './queue'

// TU-01.8 (волна 4): очередь расчётов (референс brockercabinet.png) —
// вкладки «Активные / Архив», поиск по своим сделкам, таблица на десктопе
// и карточки на мобильной ширине. Колонка «ИНВОЙС» макета не переносится —
// стоимости инвойса в периметре брокера нет, показывается реальная оценка
// платежей RUB (Д-23); «Открыть / Рассчитать» — одна и та же навигация в
// карточку сделки, подпись отражает наличие оценки (новых действий нет).
// У запроса номера нет (И1) — вместо номера бейдж «Запрос» и дата.

const fmtDate = (iso: string): string => new Date(iso).toLocaleDateString('ru-RU')

const TABS: { id: BrokerQueueTab; label: string }[] = [
  { id: 'active', label: 'Активные' },
  { id: 'archive', label: 'Архив' },
]

function dealLabel(r: BrokerQueueRow): string {
  return r.kind === 'order' ? `заявку ${r.number}` : 'запрос'
}

function ActionLink({ row }: { row: BrokerQueueRow }) {
  const calculate = row.kind === 'lead' && row.awaitingEstimate
  const href = row.kind === 'order' ? `/broker/orders/${row.id}` : `/broker/leads/${row.id}`
  const date = fmtDate(row.createdAt)
  const aria = calculate ? `Рассчитать запрос от ${date}` : `Открыть ${dealLabel(row)}`
  return (
    <Button asChild size="sm" variant={calculate ? 'default' : 'outline'}>
      <Link href={href} aria-label={aria}>
        {calculate ? 'Рассчитать' : 'Открыть'}
      </Link>
    </Button>
  )
}

function QueueBadge({ row }: { row: BrokerQueueRow }) {
  // Сужение объединения по kind — тип строки гарантирует соответствие бейджа.
  if (row.kind === 'order') {
    return <BrokerOrderStatusBadge status={row.status as OrderStatus} />
  }
  return <BrokerLeadStatusBadge status={row.status as LeadStatus} />
}

export type BrokerQueueProps = {
  loading: boolean
  rows: BrokerQueueRow[]
}

export function BrokerQueue({ loading, rows }: BrokerQueueProps) {
  const [tab, setTab] = useState<BrokerQueueTab>('active')
  const [query, setQuery] = useState('')

  const visible = useMemo(() => filterQueue(rows, tab, query), [rows, tab, query])

  return (
    <section aria-labelledby="broker-queue-title" className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="group"
          aria-label="Фильтр расчётов"
          className="inline-flex rounded-md border border-border bg-muted p-1"
        >
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              aria-pressed={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`rounded-sm px-3 py-1.5 text-xs font-semibold uppercase tracking-widest transition-colors ${
                tab === t.id
                  ? 'bg-accent-strong text-accent-strong-fg'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="relative w-full sm:w-72">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск расчёта…"
            aria-label="Поиск по номеру, контрагенту, грузу, ТН ВЭД и маршруту"
            className="pl-9"
          />
        </div>
      </div>

      {loading ? (
        <LoadingState label="Загрузка расчётов…" />
      ) : visible.length === 0 ? (
        rows.some((r) => (tab === 'active' ? !r.archived : r.archived)) ? (
          <EmptyState
            icon={SearchX}
            title="Ничего не найдено"
            description="Измените запрос — поиск идёт по номеру, контрагенту, грузу, коду ТН ВЭД и маршруту."
          />
        ) : tab === 'active' ? (
          <EmptyState
            icon={ClipboardList}
            title="Очередь пуста"
            description="Активных расчётов нет — менеджер подключает вас на этапе расчёта сделки."
          />
        ) : (
          <EmptyState
            icon={Archive}
            title="Архив пуст"
            description="Завершённые и отменённые сделки, а также отказы появятся здесь."
          />
        )
      ) : (
        <>
          {/* Десктоп: таблица очереди (референс: «ТЕКУЩАЯ ОЧЕРЕДЬ РАСЧЁТОВ») */}
          <div className="hidden overflow-hidden rounded-lg border border-border md:block">
            <table className="w-full text-sm">
              <caption className="sr-only">Очередь таможенных расчётов брокера</caption>
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  {['Сделка', 'Контрагент', 'ТН ВЭД', 'Платежи (оценка)', 'Статус', 'Действие'].map(
                    (h) => (
                      <th
                        key={h}
                        scope="col"
                        className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-widest text-muted-foreground"
                      >
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => (
                  <tr key={r.key} className="border-b border-border last:border-b-0 hover:bg-accent/50">
                    <td className="px-4 py-3">
                      {r.number ? (
                        <span className="font-mono font-semibold">{r.number}</span>
                      ) : (
                        <Badge variant="outline" className="bg-muted text-muted-foreground border-transparent">
                          Запрос · {fmtDate(r.createdAt)}
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3">{r.customerName || <span className="text-muted-foreground">—</span>}</td>
                    <td className="px-4 py-3 font-mono text-xs">
                      {r.hsCode || <span className="text-muted-foreground font-sans">—</span>}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {r.payments ?? <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <QueueBadge row={r} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <ActionLink row={r} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Мобильная ширина: карточки вместо таблицы (RULES 2.14) */}
          <div className="grid gap-2 md:hidden">
            {visible.map((r) => (
              <Card key={r.key} className="p-0">
                <CardContent className="grid gap-2 p-4">
                  {/* TU-01.9 @375: flex-wrap — длинный nowrap-бейдж статуса
                      («Требует дополнительных данных») переносится, иначе
                      карточка растягивает grid-дорожку (переполнение). */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    {r.number ? (
                      <span className="font-mono font-semibold text-lg">{r.number}</span>
                    ) : (
                      <Badge variant="outline" className="bg-muted text-muted-foreground border-transparent">
                        Запрос · {fmtDate(r.createdAt)}
                      </Badge>
                    )}
                    <QueueBadge row={r} />
                  </div>
                  <div className="text-sm">
                    {r.cargoName || <span className="text-muted-foreground">Груз не указан</span>}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {r.customerName || 'Контрагент не указан'}
                    {r.hsCode && <> · ТН ВЭД {r.hsCode}</>}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {r.routeFrom || r.routeTo ? `${r.routeFrom || '—'} → ${r.routeTo || '—'}` : 'Маршрут не указан'}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground">
                      {r.payments ? `Платежи (оценка): ${r.payments}` : 'Оценка не сообщалась'}
                    </span>
                    <ActionLink row={r} />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </section>
  )
}
