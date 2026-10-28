'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { FileSignature, Inbox, Loader2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Breadcrumbs } from '@/components/admin/Breadcrumbs'
import { CustomerCabinetAccess } from '@/components/admin/CustomerCabinetAccess'
import { OrderStatusBadge } from '@/components/admin/OrdersList'
import { LeadStatusBadge } from '@/components/admin/LeadsList'
import { STAGE_STATUS_LABELS, type OrderStatus } from '@/lib/order-constants'
import type { LeadStatus } from '@/lib/leads'

// ─── Карточка клиента (Ж6а) ─────────────────────────────────────
// Обзор «всё о клиенте»: контакты, рамочные договоры, заявки (со
// сводкой этапов как в списке Ж4) и лиды воронки. Только чтение —
// правка контактов в периметр задачи не входила.

type StageView = {
  code: string
  name: string
  status: string
  plannedDate: string | null
  contractorName: string | null
}

type OrderRow = {
  id: string
  number: string
  status: string
  createdAt: string
  stagesTotal: number
  stagesDone: number
  stagesProblem: number
  nearestStage: StageView | null
  overdue: boolean
}

type LeadRow = {
  id: string
  status: string
  createdAt: string
  updatedAt: string
  source: string
  contactName: string
  order: { id: string; number: string } | null
}

type CustomerFull = {
  customer: {
    id: string
    name: string
    phone: string | null
    email: string | null
    comment: string | null
    isActive: boolean
    createdAt: string
    hasCabinetAccess: boolean
    ordersCount: number
    contractsCount: number
    leadsCount: number
  }
  contracts: {
    id: string
    number: number
    signedAt: string | null
    createdAt: string
    legalEntity: { id: string; name: string }
    ordersCount: number
  }[]
  orders: OrderRow[]
  leads: LeadRow[]
}

const fmtDate = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleDateString('ru-RU') : ''

function SectionTitle({ children, count }: { children: React.ReactNode; count: number }) {
  return (
    <h2 className="flex items-center gap-2 text-base font-semibold">
      {children}
      <span className="text-sm font-normal text-muted-foreground">· {count}</span>
    </h2>
  )
}

export function CustomerCard() {
  const { id } = useParams<{ id: string }>()
  const [data, setData] = useState<CustomerFull | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  // Перезагрузка карточки после действий (И1: выдача/отзыв доступа
  // меняет hasCabinetAccess) — тот же запрос, тот же разбор.
  const load = useCallback(() => {
    let cancelled = false
    fetch(`/api/admin/customers/${id}`)
      .then(async (res) => {
        if (res.status === 404) {
          if (!cancelled) setNotFound(true)
          return null
        }
        const body = await res.json()
        if (!res.ok) throw new Error(body.error || 'Ошибка загрузки')
        return body as CustomerFull
      })
      .then((d) => {
        if (!cancelled && d) setData(d)
      })
      .catch(() => {
        if (!cancelled) setNotFound(true)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [id])

  useEffect(() => load(), [load])

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground text-sm py-8 justify-center">
        <Loader2 className="size-4 animate-spin" />
        Загрузка…
      </div>
    )
  }

  if (notFound || !data) {
    return (
      <div className="grid gap-4">
        <Breadcrumbs items={[{ label: 'Главная', href: '/admin' }, { label: 'Клиенты', href: '/admin/customers' }, { label: 'Клиент не найден' }]} />
        <Card className="p-8 text-center text-muted-foreground text-sm">
          Клиент не найден — возможно, запись удалена.
        </Card>
      </div>
    )
  }

  const { customer, contracts, orders, leads } = data

  return (
    <div className="grid gap-5">
      <Breadcrumbs
        items={[
          { label: 'Главная', href: '/admin' },
          { label: 'Клиенты', href: '/admin/customers' },
          { label: customer.name },
        ]}
      />

      {/* Шапка: имя + контакты */}
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{customer.name}</h1>
        <div className="text-sm text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
            <span>С нами с {fmtDate(customer.createdAt)}</span>
            {customer.phone && <span className="tabular-nums">{customer.phone}</span>}
            {customer.email && <span>{customer.email}</span>}
            {!customer.isActive && <Badge variant="outline">Неактивен</Badge>}
        </div>
        {customer.comment && (
          <p className="text-sm text-muted-foreground pt-1 max-w-2xl">{customer.comment}</p>
        )}
      </div>

      {/* Сотрудники клиента (И1 → DF-02A Блок 5): список людей с
          доступом в кабинет вместо одного пароля на компанию */}
      <CustomerCabinetAccess customerId={customer.id} onChanged={load} />

      {/* Рамочные договоры */}
      <div className="grid gap-2">
        <SectionTitle count={contracts.length}>
          <FileSignature className="size-4 text-muted-foreground" />
          Рамочные договоры
        </SectionTitle>
        {contracts.length === 0 ? (
          <Card className="p-4 text-sm text-muted-foreground">
            Договоров пока нет — первый рамочный договор пары «клиент + юрлицо»
            рождается автоматически при создании первой заявки.
          </Card>
        ) : (
          contracts.map((c) => (
            <Card key={c.id} className="p-4 flex flex-wrap items-center gap-x-6 gap-y-1">
              <div className="font-mono font-semibold text-lg min-w-20">№{c.number}</div>
              <div className="min-w-40 flex-1">
                <div className="text-sm font-medium truncate">{c.legalEntity.name}</div>
                <div className="text-xs text-muted-foreground">
                  {c.signedAt
                    ? `Подписан ${fmtDate(c.signedAt)}`
                    : 'Ещё не подписан'}
                </div>
              </div>
              <div className="text-sm text-muted-foreground tabular-nums">
                Заявок: <span className="text-foreground">{c.ordersCount}</span>
              </div>
            </Card>
          ))
        )}
      </div>

      {/* Заявки */}
      <div className="grid gap-2">
        <SectionTitle count={orders.length}>Заявки</SectionTitle>
        {orders.length === 0 ? (
          <Card className="p-4 text-sm text-muted-foreground">Заявок пока нет.</Card>
        ) : (
          orders.map((o) => (
            <Link key={o.id} href={`/admin/orders/${o.id}`} className="block group">
              <Card className="p-4 flex flex-wrap items-center gap-x-6 gap-y-2 transition-colors group-hover:border-ring">
                <div className="font-mono font-semibold text-lg min-w-20">{o.number}</div>
                <div className="min-w-44 flex-1">
                  <div className="text-xs text-muted-foreground">Ближайший этап</div>
                  <div className="text-sm font-medium truncate">
                    {o.nearestStage ? o.nearestStage.name : 'Все этапы завершены'}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {o.nearestStage
                      ? `${STAGE_STATUS_LABELS[o.nearestStage.status as keyof typeof STAGE_STATUS_LABELS] ?? o.nearestStage.status}${
                          o.nearestStage.plannedDate
                            ? ' · план ' + fmtDate(o.nearestStage.plannedDate)
                            : ''
                        }`
                      : `от ${fmtDate(o.createdAt)}`}
                  </div>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground tabular-nums">
                  Этапы: {o.stagesDone}/{o.stagesTotal}
                  {o.stagesProblem > 0 && <Badge variant="delay">{o.stagesProblem} пробл.</Badge>}
                  {o.overdue && <Badge variant="delay">Просрочка</Badge>}
                </div>
                <OrderStatusBadge status={o.status as OrderStatus} />
              </Card>
            </Link>
          ))
        )}
      </div>

      {/* Лиды */}
      <div className="grid gap-2">
        <SectionTitle count={leads.length}>
          <Inbox className="size-4 text-muted-foreground" />
          Запросы
        </SectionTitle>
        {leads.length === 0 ? (
          <Card className="p-4 text-sm text-muted-foreground">Запросов от этого клиента пока нет.</Card>
        ) : (
          leads.map((l) => (
            <Link key={l.id} href={`/admin/leads/${l.id}`} className="block group">
              <Card className="p-4 flex flex-wrap items-center gap-x-6 gap-y-1 transition-colors group-hover:border-ring">
                <div className="min-w-40 flex-1">
                  <div className="text-sm font-medium truncate">{l.contactName}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    Обращение {fmtDate(l.createdAt)} · движение {fmtDate(l.updatedAt)}
                    {l.order ? ` · конвертирован в заявку ${l.order.number}` : ''}
                  </div>
                </div>
                <LeadStatusBadge status={l.status as LeadStatus} />
                {l.source === 'cabinet' && <Badge variant="outline">Кабинет</Badge>}
              </Card>
            </Link>
          ))
        )}
      </div>
    </div>
  )
}
