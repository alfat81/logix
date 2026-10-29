'use client'

// Карточка заявки (Ж1). P1-19: монолит 1169 строк разрезан на
// order/OrderCargoCard, order/OrderQuoteCard, order/OrderStages и
// order/types.ts (RULES 2.14, файлы ≤ 300). Layout — BRANDBOOK §4:
// рабочая область 1fr + правая панель «Детали/Журнал» 320px (заметка
// Ж3 + лента Ж2, sticky; < xl панель складывается вниз, DOM-порядок
// сохранён) — симметрично карточке лида (этап B, P1-18).
import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowRight, Loader2, Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import { ActivityFeed } from '@/components/admin/ActivityFeed'
import { Breadcrumbs } from '@/components/admin/Breadcrumbs'
import { AssigneeField } from '@/components/admin/AssigneeField'
import { NoteForm } from '@/components/admin/NoteForm'
import { DocumentsSection } from '@/components/documents/DocumentsSection'
import { InfoField } from '@/components/admin/InfoField'
import { BrokerLinksSection, type BrokerEstimateRow } from '@/components/admin/BrokerLinksSection'
import { CustomsCalcScreen } from '@/components/admin/customs/CustomsCalcScreen'
import { toEstimatePrefill } from '@/components/admin/customs/prefill'
import { CARGO_PROFILE_LABELS } from '@/lib/order-constants'
import {
  ORDER_STATUSES,
  ORDER_STATUS_LABELS,
} from '@/lib/order-constants'
import { fmtDate, type OrderFull } from '@/components/admin/order/types'
import { OrderCargoCard } from '@/components/admin/order/OrderCargoCard'
import { OrderQuoteCard } from '@/components/admin/order/OrderQuoteCard'
import { OrderStages } from '@/components/admin/order/OrderStages'

export default function OrderPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { toast } = useToast()

  const [order, setOrder] = useState<OrderFull | null>(null)
  const [loading, setLoading] = useState(true)

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

  const doneCount = order.stages.filter((s) => s.status === 'done').length
  const problemCount = order.stages.filter((s) => s.status === 'problem').length

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
      {/* BRANDBOOK §4: рабочая область 1fr + правая панель 320px
          (P1-19 — панель теперь и у заявки; < xl складывается вниз) */}
      <div className="space-y-4 min-w-0">
        {/* Ж7: крошки вместо кнопки «назад» — путь виден целиком
            (Главная / Заявки / текущая заявка). */}
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
              <SelectTrigger size="sm" className="w-44">
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

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Условия перевозки</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <InfoField label="Клиент" value={order.customer.name} />
            {/* Ж1: контакты клиента прямо в карточке — менеджеру не
                ходить за ними в справочник */}
            <InfoField label="Телефон клиента" value={order.customer.phone ?? '—'} />
            <InfoField label="Email клиента" value={order.customer.email ?? '—'} />
            <InfoField label="Юрлицо" value={order.legalEntity.name} />
            <InfoField label="Договор" value={`№ ${order.contract.number}`} />
            <InfoField label="Создана" value={fmtDate(order.createdAt)} />
            <InfoField label="Инкотермс" value={order.incoterm ?? '—'} />
            <InfoField label="ТН ВЭД" value={order.hsCode ?? '—'} />
            <InfoField label="Груз" value={CARGO_PROFILE_LABELS[order.cargoProfile]} />
            <InfoField
              label="Этапы"
              value={`${doneCount}/${order.stages.length} завершено${problemCount ? ` · ${problemCount} проблема` : ''}`}
            />
          </CardContent>
        </Card>

        {/* ── Ж1: лид-источник (заявки из воронки В4) ───────────────
            Снимки груза и условий уже скопированы в заявку — ссылка
            ведёт к истории запроса (варианты, отказы, анкета лида) */}
        {order.lead && (
          <Card className="p-4 flex flex-wrap items-center gap-4 border-success/50 bg-success/5">
            <div className="flex-1">
              <div className="font-medium">Конвертирована из запроса от {fmtDate(order.lead.createdAt)}</div>
              <div className="text-sm text-muted-foreground">
                Груз и условия скопированы снимком — заявка живёт независимо от запроса
              </div>
            </div>
            <Button variant="outline" asChild>
              <Link href={`/admin/leads/${order.lead.id}`}>
                Запрос-источник
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </Card>
        )}

        {/* ── Ж1: суть заявки — груз и маршрут + условия сделки
            (компоненты order/, P1-19) ─────────────────────────────── */}
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

        {/* ── Д: брокеры сделки (роадмап 5а) — видимость заявки целиком;
            оценки — с лида-источника, живые (брокер уточняет и после
            конвертации). */}
        <BrokerLinksSection
          targetType="order"
          targetId={String(id)}
          links={order.brokers}
          estimatesByBrokerId={estimatesByBrokerId}
          onChanged={load}
          emptyText="Брокеры не подключены — сделка видна только менеджеру и подключённым подрядчикам своих этапов"
        />

        {/* ── DF-19: расчёт таможенных платежей заявки (оценка в рублях;
            проценты брокера — с лида-источника, отменённая — без секции) */}
        {order.status !== 'cancelled' && (
          <CustomsCalcScreen
            targetType="order"
            targetId={String(id)}
            estimates={toEstimatePrefill(order.lead?.brokers ?? [])}
            initialIncoterm={order.incotermCode}
            initialPlace={order.incotermPlace}
            onChanged={load}
          />
        )}

        {/* ── Е: документы сделки (роадмап 5) — обмен клиент/брокер/
            менеджер внутри сервиса, версионность; менеджер видит всё,
            включая внутренние. */}
        <DocumentsSection
          documentsUrl={`/api/admin/orders/${id}/documents`}
          versionsUrlFor={(docId) => `/api/admin/documents/${docId}/versions`}
          deleteUrlFor={(docId) => `/api/admin/documents/${docId}`}
          canMarkInternal
          emptyText="Документов нет — товаросопроводительные и таможенные бумаги живут здесь, без почты"
        />

        <OrderStages orderId={String(id)} stages={order.stages} onChanged={load} />
      </div>

      {/* Правая панель «Детали/Журнал» (BRANDBOOK §4, 320px, P1-19):
          заметка (Ж3) + лента (Ж2). Sticky на xl; на < xl — блок внизу. */}
      <aside className="space-y-4 min-w-0 xl:sticky xl:top-14">
        {/* Ж3: внутренняя заметка — пишется в ленту, видна только
            сотрудникам (подрядчику/клиенту isInternal не отдаётся) */}
        <NoteForm targetType="order" targetId={String(id)} onAdded={load} />

        {/* Ж2: лента событий — хроника заявки (статусы, суть,
            этапы, исполнители) от сотрудников и подрядчиков */}
        <ActivityFeed
          activities={order.activities}
          emptyText="Событий пока нет — журнал начнётся с первого действия"
        />
      </aside>
    </div>
  )
}
