'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { CalendarDays, ChevronRight, Loader2, PackageOpen } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'
import { readApiResponse } from '@/lib/api-client'
import { ClientLeadCreateDialog } from '@/components/client/ClientLeadCreateDialog'
import {
  ClientLeadStatusBadge,
  ClientOrderStatusBadge,
} from '@/components/client/ClientBadges'
import {
  readLeadCargo,
  type LeadStatus,
} from '@/lib/leads'
import type { OrderStatus, StageStatus } from '@/lib/order-constants'

// ─── Главная клиентского кабинета (И1) ──────────────────────────────
// Две секции: «Мои заявки» (статусы этапов — главное, ради чего
// кабинет существует) и «Мои запросы» (воронка до превращения в
// заявку + создание нового запроса). Всё только чтение, кроме
// создания запроса; никаких подрядчиков, ставок и цен — решение
// вопроса №1 от 14.10.2026.
//
// v0.5.0 (P1-22): диалог создания запроса — выезд в
// ClientLeadCreateDialog (резка под лимит 300, RULES 2.14).

type ClientStage = {
  id: string
  name: string
  sequence: number
  status: StageStatus
  plannedDate: string | null
  actualDate: string | null
}

type ClientOrder = {
  id: string
  number: string
  status: OrderStatus
  createdAt: string
  cargoInfo: Record<string, unknown> | null
  stages: ClientStage[]
}

type ClientLead = {
  id: string
  status: LeadStatus
  createdAt: string
  cargoInfo: Record<string, unknown> | null
  order: { id: string; number: string } | null
}

const fmtDate = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleDateString('ru-RU') : '—'

// Краткая строка маршрута/груза из анкеты (та же выжимка, что в
// списках админки — readLeadCargo толерантен к чужой структуре)
function routeOf(cargoInfo: Record<string, unknown> | null): { from: string; to: string; cargoName: string } {
  const c = readLeadCargo(cargoInfo)
  const s = (v: unknown): string => (typeof v === 'string' && v ? v : '')
  return { from: s(c.from), to: s(c.to), cargoName: s(c.cargoName) }
}

export function ClientHome() {
  const { toast } = useToast()

  const [orders, setOrders] = useState<ClientOrder[] | null>(null)
  const [leads, setLeads] = useState<ClientLead[] | null>(null)

  const loadOrders = useCallback(async () => {
    try {
      const res = await fetch('/api/client/orders')
      const data = await readApiResponse<{ orders?: ClientOrder[]; error?: string }>(res)
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
      const res = await fetch('/api/client/leads')
      const data = await readApiResponse<{ leads?: ClientLead[]; error?: string }>(res)
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
            Статусы этапов каждой перевозки — от забора груза до доставки получателю.
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
            Заявок пока нет. Отправьте запрос на расчёт — как только менеджер
            оформит заявку, её статусы появятся здесь.
          </Card>
        ) : (
          <div className="grid gap-2">
            {orders.map((o) => {
              const r = routeOf(o.cargoInfo)
              const done = o.stages.filter((s) => s.status === 'done').length
              const nearest = o.stages.find((s) => s.status !== 'done') ?? null
              return (
                <Card key={o.id} className="p-0">
                  <Link href={`/client/orders/${o.id}`}>
                    <CardContent className="p-4 flex flex-wrap items-center gap-x-4 gap-y-2 hover:bg-accent/50 transition-colors">
                      <span className="font-semibold font-mono text-lg">{o.number}</span>
                      <ClientOrderStatusBadge status={o.status} />
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <CalendarDays className="size-3" />
                        создана {fmtDate(o.createdAt)}
                      </span>
                      <div className="min-w-48 flex-1">
                        <div className="text-sm truncate">
                          {r.cargoName || <span className="text-muted-foreground">Груз не указан</span>}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {r.from || r.to ? `${r.from || '—'} → ${r.to || '—'}` : 'Маршрут не указан'}
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

      {/* ── Мои запросы ────────────────────────────────────────── */}
      <section className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Мои запросы на расчёт</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Запросы становятся заявками после согласования условий с менеджером.
            </p>
          </div>
          <ClientLeadCreateDialog onCreated={loadLeads} />
        </div>

        {leads === null ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm py-8 justify-center">
            <Loader2 className="size-4 animate-spin" />
            Загрузка…
          </div>
        ) : leads.length === 0 ? (
          <Card className="p-8 text-center text-muted-foreground text-sm">
            Запросов пока нет — отправьте первый, кнопкой «Новый запрос».
          </Card>
        ) : (
          <div className="grid gap-2">
            {leads.map((l) => {
              const r = routeOf(l.cargoInfo)
              return (
                <Card key={l.id} className="p-4 flex flex-wrap items-center gap-x-4 gap-y-2">
                  <Link
                    href={`/client/leads/${l.id}`}
                    className="min-w-48 flex-1 group"
                  >
                    <div className="text-sm group-hover:underline">
                      {r.cargoName || <span className="text-muted-foreground">Груз не указан</span>}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {r.from || r.to ? `${r.from || '—'} → ${r.to || '—'}` : 'Маршрут не указан'} · от{' '}
                      {fmtDate(l.createdAt)}
                    </div>
                  </Link>
                  {l.order ? (
                    <Link
                      href={`/client/orders/${l.order.id}`}
                      className="text-sm font-medium font-mono hover:underline"
                    >
                      Заявка {l.order.number}
                    </Link>
                  ) : (
                    <span className="text-xs text-muted-foreground">ждёт расчёта менеджера</span>
                  )}
                  <ClientLeadStatusBadge status={l.status} />
                </Card>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
