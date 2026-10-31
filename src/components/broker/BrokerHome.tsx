'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { CalendarDays, ChevronRight, ClipboardList, Loader2, PackageOpen } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'
import { readApiResponse } from '@/lib/api-client'
import { readLeadCargo } from '@/lib/leads'
import { routeLineOf } from '@/lib/route-fields'
import { fmtDuty } from '@/lib/brokers'
import {
  BrokerLeadStatusBadge,
  BrokerOrderStatusBadge,
} from '@/components/broker/BrokerBadges'
import type { OrderStatus, StageStatus } from '@/lib/order-constants'
import type { LeadStatus } from '@/lib/leads'

// ─── Главная портала брокера (Д) ────────────────────────────────────
// Две секции: «Мои заявки» (сделки в исполнении — видимость целиком,
// 5а) и «Запросы в расчёте» (лиды без заявки, где брокер консультирует:
// анкета груза + форма оценки платежей). Сконвертированные расчёты в
// списке лидов не дублируются — сделка переехала в заявки.

type BrokerOrderRow = {
  id: string
  number: string
  status: OrderStatus
  createdAt: string
  cargoInfo: Record<string, unknown> | null
  // DF-23 (б): маршрут/метрики — строка маршрута списка из колонок
  originCity?: string | null
  originCountry?: string | null
  destinationCity?: string | null
  destinationCountry?: string | null
  customerName: string | null
  estimate: { customsDutyEstimate: number | null } | null
  stages: { id: string; name: string; status: StageStatus }[]
}

type BrokerLeadRow = {
  id: string
  status: LeadStatus
  createdAt: string
  cargoInfo: Record<string, unknown> | null
  originCity?: string | null
  originCountry?: string | null
  destinationCity?: string | null
  destinationCountry?: string | null
  customerName: string | null
  estimate: { customsDutyEstimate: number | null } | null
}

const fmtDate = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleDateString('ru-RU') : '—'

// Выжимка строки списка: маршрут — из колонок (DF-23 (б), легаси-
// fallback routeLineOf — ключи from/to из cargoInfo больше не пишутся),
// груз и ТН ВЭД — из анкеты
function routeOf(row: BrokerOrderRow | BrokerLeadRow): {
  from: string
  to: string
  cargoName: string
  hsCode: string
} {
  const c = readLeadCargo(row.cargoInfo)
  const s = (v: unknown): string => (typeof v === 'string' && v ? v : '')
  return { ...routeLineOf(row, row.cargoInfo), cargoName: s(c.cargoName), hsCode: s(c.hsCode) }
}

export function BrokerHome() {
  const { toast } = useToast()

  const [orders, setOrders] = useState<BrokerOrderRow[] | null>(null)
  const [leads, setLeads] = useState<BrokerLeadRow[] | null>(null)

  const loadOrders = useCallback(async () => {
    try {
      const res = await fetch('/api/broker/orders')
      const data = await readApiResponse<{ orders?: BrokerOrderRow[]; error?: string }>(res)
      if (!res.ok) throw new Error(data.error || 'Ошибка загрузки')
      setOrders(data.orders ?? [])
    } catch (e) {
      toast({
        title: 'Не удалось загрузить заявки',
        description: e instanceof Error ? e.message : '',
        variant: 'destructive',
      })
      setOrders([])
    }
  }, [toast])

  const loadLeads = useCallback(async () => {
    try {
      const res = await fetch('/api/broker/leads')
      const data = await readApiResponse<{ leads?: BrokerLeadRow[]; error?: string }>(res)
      if (!res.ok) throw new Error(data.error || 'Ошибка загрузки')
      setLeads(data.leads ?? [])
    } catch (e) {
      toast({
        title: 'Не удалось загрузить запросы',
        description: e instanceof Error ? e.message : '',
        variant: 'destructive',
      })
      setLeads([])
    }
  }, [toast])

  useEffect(() => {
    loadOrders()
    loadLeads()
  }, [loadOrders, loadLeads])

  return (
    <div className="grid gap-8">
      {/* ── Мои заявки ─────────────────────────────────────────── */}
      <section className="grid gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Мои заявки</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Сделки, где вы подключены: вся цепочка этапов и статусы — от расчёта
            до доставки получателю.
          </p>
        </div>

        {orders === null ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm py-8 justify-center">
            <Loader2 className="size-4 animate-spin" />
            Загрузка…
          </div>
        ) : orders.length === 0 ? (
          <Card className="p-8 text-center text-muted-foreground">
            <PackageOpen className="size-8 mx-auto mb-3 opacity-50" />
            Заявок пока нет. Когда менеджер подключит вас к сделке, она появится здесь.
          </Card>
        ) : (
          <div className="grid gap-2">
            {orders.map((o) => {
              const r = routeOf(o)
              const done = o.stages.filter((s) => s.status === 'done').length
              const nearest = o.stages.find((s) => s.status !== 'done') ?? null
              return (
                <Card key={o.id} className="p-0">
                  <Link href={`/broker/orders/${o.id}`}>
                    <CardContent className="p-4 flex flex-wrap items-center gap-x-4 gap-y-2 hover:bg-accent/50 transition-colors">
                      <span className="font-semibold font-mono text-lg">{o.number}</span>
                      <BrokerOrderStatusBadge status={o.status} />
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <CalendarDays className="size-3" />
                        создана {fmtDate(o.createdAt)}
                      </span>
                      <div className="min-w-48 flex-1">
                        <div className="text-sm truncate">
                          {r.cargoName || <span className="text-muted-foreground">Груз не указан</span>}
                          {r.hsCode && <span className="text-muted-foreground"> · ТН ВЭД {r.hsCode}</span>}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {r.from || r.to ? `${r.from || '—'} → ${r.to || '—'}` : 'Маршрут не указан'}
                          {o.customerName ? ` · ${o.customerName}` : ''}
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground whitespace-nowrap">
                        Этапы: {done} из {o.stages.length}
                        {nearest && <> · далее «{nearest.name}»</>}
                      </div>
                      <ChevronRight className="size-4 text-muted-foreground ml-auto" />
                    </CardContent>
                  </Link>
                </Card>
              )
            })}
          </div>
        )}
      </section>

      {/* ── Запросы в расчёте ──────────────────────────────────── */}
      <section className="grid gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Запросы в расчёте</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Анкеты грузов до создания заявки: посчитайте платежи и сообщите
            список разрешительных документов.
          </p>
        </div>

        {leads === null ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm py-8 justify-center">
            <Loader2 className="size-4 animate-spin" />
            Загрузка…
          </div>
        ) : leads.length === 0 ? (
          <Card className="p-8 text-center text-muted-foreground text-sm">
            <ClipboardList className="size-8 mx-auto mb-3 opacity-50" />
            Активных расчётов нет — менеджер подключает вас на этапе расчёта сделки.
          </Card>
        ) : (
          <div className="grid gap-2">
            {leads.map((l) => {
              const r = routeOf(l)
              return (
                <Card key={l.id} className="p-0">
                  <Link href={`/broker/leads/${l.id}`}>
                    <CardContent className="p-4 flex flex-wrap items-center gap-x-4 gap-y-2 hover:bg-accent/50 transition-colors">
                      <BrokerLeadStatusBadge status={l.status} />
                      <div className="min-w-48 flex-1">
                        <div className="text-sm">
                          {r.cargoName || <span className="text-muted-foreground">Груз не указан</span>}
                          {r.hsCode && <span className="text-muted-foreground"> · ТН ВЭД {r.hsCode}</span>}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {r.from || r.to ? `${r.from || '—'} → ${r.to || '—'}` : 'Маршрут не указан'} ·
                          от {fmtDate(l.createdAt)}
                          {l.customerName ? ` · ${l.customerName}` : ''}
                        </div>
                      </div>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {l.estimate
                          ? `платежи: ${fmtDuty(l.estimate.customsDutyEstimate)}`
                          : 'оценка не сообщалась'}
                      </span>
                      <ChevronRight className="size-4 text-muted-foreground ml-auto" />
                    </CardContent>
                  </Link>
                </Card>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
