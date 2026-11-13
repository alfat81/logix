'use client'

// Карточка заявки (Ж1). P1-19: монолит 1169 строк разрезан на
// order/OrderCargoCard, order/OrderQuoteCard, order/OrderStages и
// order/types.ts (RULES 2.14, файлы ≤ 300). Layout — BRANDBOOK §4:
// рабочая область 1fr + правая панель 320px.
//
// DF-21: правая панель — вкладки «События | Документы | Расчёт»;
// DF-26: выбор вкладки «Документы» переводит основную область в реестр
// документов (order/OrderRegistryMode), возврат — «К заявке» в его
// шапке; карточки заявки (груз, расчёт, этапы) скрываются, состояние
// страницы сохраняется. На телефоне (≤768px, §4.5) страница —
// полноэкранный «лист деталей» с кнопкой «Назад»; основная колонка
// складывается под панелью без изменения DOM-порядка.
import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Loader2, Printer } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { readApiResponse } from '@/lib/api-client'
import { OrderStatusBadge } from '@/components/admin/OrdersList'
import { WaitingBadge } from '@/components/admin/WaitingBadge'
import { Breadcrumbs } from '@/components/admin/Breadcrumbs'
import { AssigneeField } from '@/components/admin/AssigneeField'
import { BrokerLinksSection, type BrokerEstimateRow } from '@/components/admin/BrokerLinksSection'
import { toEstimatePrefill } from '@/components/admin/customs/prefill'
import { OrderSidePanel } from '@/components/admin/order/OrderSidePanel'
import { OrderInfoCards } from '@/components/admin/order/OrderInfoCards'
import { OrderRegistryMode } from '@/components/admin/order/OrderRegistryMode'
import { ORDER_STATUSES, ORDER_STATUS_LABELS } from '@/lib/order-constants'
import type { OrderFull } from '@/components/admin/order/types'
import { OrderCargoCard } from '@/components/admin/order/OrderCargoCard'
import { OrderQuoteCard } from '@/components/admin/order/OrderQuoteCard'
import { OrderStages } from '@/components/admin/order/OrderStages'
import { StatusSuggestion } from '@/components/admin/order/StatusSuggestion'
import { BackLink } from '@/components/admin/order/BackLink'

export default function OrderPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { toast } = useToast()

  const [order, setOrder] = useState<OrderFull | null>(null)
  const [loading, setLoading] = useState(true)
  // DF-26: режим основной области — карточки заявки или реестр документов
  const [docsOpen, setDocsOpen] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/orders/${id}`)
      if (res.status === 404) {
        toast({ title: 'Заявка не найдена', variant: 'destructive' })
        router.replace('/admin/orders')
        return
      }
      const data = await readApiResponse<{ order: OrderFull; error?: string }>(res)
      if (!res.ok) throw new Error(data.error || 'Ошибка загрузки')
      setOrder(data.order)
    } catch (e) {
      toast({
        title: 'Не удалось загрузить заявку',
        description: e instanceof Error ? e.message : '',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }, [id, router, toast])

  useEffect(() => {
    load()
  }, [load])

  const patchOrder = async (body: Record<string, unknown>) => {
    const res = await fetch(`/api/admin/orders/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await readApiResponse<{ message?: string; error?: string }>(res)
    if (!res.ok) {
      toast({ title: data.error || 'Ошибка', variant: 'destructive' })
      return false
    }
    toast({ title: data.message || 'Обновлено' })
    load()
    return true
  }

  if (loading || !order) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground text-sm py-16 justify-center">
        <Loader2 className="size-4 animate-spin" />
        Загрузка…
      </div>
    )
  }

  // Д: оценки брокеров по brokerId — с лида-источника (перенос В4):
  // оценка живёт на связи LeadBroker, заявка показывает её в
  // контексте каждого подключённого брокера
  const estimatesByBrokerId: Record<string, BrokerEstimateRow> = {}
  for (const lb of order.lead?.brokers ?? []) {
    if (lb.estimate) {
      estimatesByBrokerId[lb.broker.id] = lb.estimate
    }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start xl:gap-6">
      {/* BRANDBOOK §4: рабочая область 1fr + правая панель 320px; < xl панель
          складывается вниз после основной колонки, DOM-порядок сохранён */}
      <div className="space-y-4 min-w-0">
        {/* §4.5 (DF-21): на телефоне лист деталей начинается кнопкой
            «Назад» (md:hidden); на md+ путь показывает Ж7-крошки */}
        <BackLink href="/admin/orders" />
        <Breadcrumbs
          items={[
            { label: 'Главная', href: '/admin' },
            { label: 'Заявки', href: '/admin/orders' },
            { label: `№ ${order.number}` },
          ]}
        />
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight font-mono">{order.number}</h1>
          <OrderStatusBadge status={order.status} />
          {/* DF-05: «у кого мяч» рядом со статусом */}
          <WaitingBadge
            kind={order.waitingOnKind ?? null}
            reason={order.waitingReason ?? null}
            since={order.waitingSince ?? null}
          />
          {/* Е: печатная форма заявки — приложение к договору по
              реальному бланку из S13 */}
          <a
            href={`/admin/orders/${order.id}/print`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground underline underline-offset-4"
          >
            <Printer className="size-4" />
            Печатная форма
          </a>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-sm text-muted-foreground hidden sm:inline">Статус заявки:</span>
            <Select
              value={order.status}
              onValueChange={(v) => patchOrder({ status: v })}
            >
              <SelectTrigger aria-label="Статус заявки" size="sm" className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ORDER_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {ORDER_STATUS_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* P1-01: ответственный менеджер — смена PATCH'ем с записью в журнал
            (у мастера — выбор из справочника, у менеджера — read-only) */}
        <AssigneeField
          value={order.assignee?.id ?? null}
          currentName={order.assignee?.name ?? null}
          onSave={(employeeId) => patchOrder({ assignedToId: employeeId })}
        />

        {/* DF-06: подсказка статуса по этапам одним нажатием — только
            разрешённые матрицей переходы; ручной Select выше не менялся */}
        <StatusSuggestion
          stages={order.stages}
          current={order.status}
          onApply={(to) => patchOrder({ status: to })}
        />

        {docsOpen ? (
          /* DF-26: режим реестра — карточки заявки скрыты, состояние
             страницы сохраняется; возврат — «К заявке» в шапке реестра */
          <OrderRegistryMode
            orderId={String(id)}
            transportType={order.transportType ?? null}
            stages={order.stages}
            onBack={() => setDocsOpen(false)}
            onChanged={load}
          />
        ) : (
          <>
            <OrderInfoCards order={order} />
            <OrderCargoCard
              orderId={String(id)}
              route={order}
              cargoInfo={order.cargoInfo}
              onChanged={load}
            />
            <OrderQuoteCard
              orderId={String(id)}
              snapshot={order.quoteSnapshot}
              onChanged={load}
            />
            {/* ── Д: брокеры сделки (5а) — видимость заявки целиком;
                оценки — с лида-источника, живые (брокер уточняет и после В4) */}
            <BrokerLinksSection
              targetType="order"
              targetId={String(id)}
              links={order.brokers}
              estimatesByBrokerId={estimatesByBrokerId}
              onChanged={load}
              emptyText="Брокеры не подключены — сделка видна только менеджеру и подключённым подрядчикам своих этапов"
            />
            <OrderStages orderId={String(id)} stages={order.stages} onChanged={load} />
          </>
        )}
      </div>

      {/* Правая панель (BRANDBOOK §4, 320px) — DF-21: вкладки
          «События | Документы | Расчёт»; DF-26: «Документы» — сводка
          и переключение основной области в реестр */}
      <aside aria-label="Панель сделки" className="min-w-0 xl:sticky xl:top-14">
        <OrderSidePanel
          orderNumber={order.number}
          orderId={String(id)}
          status={order.status}
          activities={order.activities}
          estimates={toEstimatePrefill(order.lead?.brokers ?? [])}
          initialIncoterm={order.incotermCode}
          initialPlace={order.incotermPlace}
          onChanged={load}
          onOpenRegistry={() => setDocsOpen(true)}
        />
      </aside>
    </div>
  )
}
