'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'
import { readApiResponse } from '@/lib/api-client'
import { ClientLeadCreateDialog } from '@/components/client/ClientLeadCreateDialog'
import { ClientSummaryCards, tonsFromWeights } from '@/components/client/ClientSummaryCards'
import { ClientOffers, type OfferSummary } from '@/components/client/ClientOffers'
import {
  ClientStatusTimeline,
  type TimelineOrder,
} from '@/components/client/ClientStatusTimeline'
import { ClientOrdersList, type ClientOrder } from '@/components/client/ClientOrdersList'
import { ClientLeadRow } from './ClientLeadRow'
import type { LeadStatus } from '@/lib/leads'
import { ORDER_ACTIVE_STATUSES } from '@/lib/order-constants'
import { ClientLeadArchive } from './ClientLeadArchive'

// ─── Обзор клиентского кабинета (И1, TU-01.7 волна 3) ───────────────
// Референс clientcabinet.png: приветствие (подзаголовок — без
// обещаний реального времени, исправление макета (б)), сводные
// карточки с реальными счётчиками, «Актуальные предложения»
// (рассчитанные запросы), списки заявок/запросов, таймлайн статусов
// последней активной заявки, «Информационная среда» — без маржинальной
// стоимости (исправление макета (а), реестр отклонений Д-19/Д-20).
// Всё только чтение, кроме создания запроса; никаких подрядчиков,
// ставок и цен — решение вопроса №1 от 14.10.2026. Демо-значения
// макета (04/02/12.4, «ООО „Ромашка"», REQ-14-5) не переносятся —
// только реальные данные БД (RULES: выдумывать данные запрещено).

type ClientLead = {
  id: string
  status: LeadStatus
  createdAt: string
  cargoInfo: Record<string, unknown> | null
  originCity?: string | null
  originCountry?: string | null
  destinationCity?: string | null
  destinationCountry?: string | null
  order: { id: string; number: string } | null
}

export function ClientHome({ userName, companyName }: { userName: string; companyName: string }) {
  const { toast } = useToast()

  const [orders, setOrders] = useState<ClientOrder[] | null>(null)
  const [leads, setLeads] = useState<ClientLead[] | null>(null)
  const [offerSummary, setOfferSummary] = useState<OfferSummary[]>([])
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
      const data = await readApiResponse<{
        leads?: ClientLead[]
        offerSummary?: OfferSummary[]
        error?: string
      }>(res)
      if (!res.ok) throw new Error(data.error || 'Ошибка загрузки')
      setLeads(data.leads ?? [])
      setOfferSummary(data.offerSummary ?? [])
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

  // TU-01.7: запрос создан из шапки (ClientNewRequestButton) —
  // обновить список без прокидывания колбэков через layout
  useEffect(() => {
    const onCreate = () => loadLeads()
    window.addEventListener('client:lead-created', onCreate)
    return () => window.removeEventListener('client:lead-created', onCreate)
  }, [loadLeads])

  const activeOrders = (orders ?? []).filter((o) =>
    (ORDER_ACTIVE_STATUSES as readonly string[]).includes(o.status)
  )
  const onApprovalLeads = (leads ?? []).filter((l) => l.status === 'calculated')
  const tons = orders ? tonsFromWeights(activeOrders.map((o) => o.weightKg)) : null
  // Таймлайн — последняя активная заявка (список отсортирован по дате)
  const timelineOrder: TimelineOrder | null = activeOrders.length
    ? {
        id: activeOrders[0].id,
        number: activeOrders[0].number,
        stages: activeOrders[0].stages,
      }
    : null
  const firstName = (userName || '').trim().split(/\s+/)[0] ?? ''
  const loadingSummary = orders === null || leads === null

  return (
    <div className="grid lg:grid-cols-[1fr_320px] gap-8">
      <div className="grid gap-8">
        {/* Приветствие: подзаголовок без real-time (исправление макета (б)) */}
        <div>
          <h1 className="text-3xl font-bold italic uppercase tracking-tight">
            Добро пожаловать{firstName ? ',' : ''}{' '}
            {firstName && <span className="text-accent-text">{firstName}.</span>}
          </h1>
          <p className="mt-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Статусы и ожидаемые даты — по фактическим данным системы
          </p>
        </div>

        <ClientSummaryCards
          loading={loadingSummary}
          activeOrders={activeOrders.length}
          onApproval={onApprovalLeads.length}
          tons={tons}
        />

        {(orders ?? []).length > 0 && (
          <div className="hidden lg:block text-sm text-muted-foreground">
            {companyName ? `${companyName} · ` : ''}полная история — в разделах «Мои заявки» и «Мои
            запросы» ниже.
          </div>
        )}

        <ClientOffers leads={onApprovalLeads} summary={offerSummary} />

        <ClientOrdersList orders={orders} />

        {/* ── Мои запросы ────────────────────────────────────────── */}
        <section className="grid gap-3" id="requests" aria-labelledby="requests-title">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 id="requests-title" className="text-lg font-semibold tracking-tight">
                Мои запросы на расчёт
              </h2>
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
              Запросов пока нет — отправьте первый, кнопкой «Новый запрос» в шапке или выше.
            </Card>
          ) : (
            <div className="grid gap-2">
              {leads.map((l) => (
                <ClientLeadRow key={l.id} lead={l} />
              ))}
            </div>
          )}
        </section>

        {/* ── BL-7: архив запросов (won/lost) — ClientLeadArchive.tsx (RULES 2.14) ── */}
        <ClientLeadArchive />
      </div>

      {/* ── Правая колонка: таймлайн + информационная среда ──────── */}
      <aside className="grid gap-6 content-start">
        <ClientStatusTimeline order={timelineOrder} />
        {/* Информационная среда: без маржинальной стоимости —
            исправление макета (а), реестр отклонений Д-19 */}
        <Card className="p-6 bg-muted/40">
          <CardContent className="p-0">
            <div className="flex size-7 items-center justify-center rounded-full bg-accent-strong text-accent-strong-fg text-xs font-bold">
              i
            </div>
            <h3 className="mt-3 text-sm font-semibold uppercase tracking-widest">
              Информационная среда
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Здесь отражаются только актуальные результаты таможенных расчётов,
              статусы и ожидаемые даты — по фактическим данным системы. Полные
              варианты стоимости — в карточке каждого запроса.
            </p>
          </CardContent>
        </Card>
      </aside>
    </div>
  )
}
