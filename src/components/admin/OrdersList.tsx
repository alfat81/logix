'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { TRANSPORT_TYPE_CODES, TRANSPORT_TYPE_LABELS } from '@/lib/route-fields'
import { cn } from '@/lib/utils'
import {
  ORDER_ACTIVE_STATUSES,
  type OrderStatus,
} from '@/lib/order-constants'
import { OrderCard, type OrderRow } from '@/components/admin/OrderCard'
import { OrderCreateDialog } from '@/components/admin/OrderCreateDialog'
import { OrdersToolbar } from '@/components/admin/OrdersToolbar'

// P1-19 (v0.3.0) — экспорт сохранён: OrderStatusBadge переезжает в
// собственный файл (13 потребителей), реэкспорт не ломает импорты.
export { OrderStatusBadge } from '@/components/admin/OrderStatusBadge'

// ─── Список заявок (Ж4) — эталонный паттерн ─────────────────────────
// v0.3.1 (BRANDBOOK §4.2–4.3, референс-макет D24): шапка раздела —
// заголовок + табы-группы (активный — Ink/Medium с подчёркиванием
// Coral, неактивные — приглушённые) + поиск с лупой + главное действие
// Coral «Новая заявка»; карточки — анатомия §4.3 (OrderCard: номер,
// маршрут, клиент, ETA, степпер, задержка). Детальные статус-кнопки
// заменены группами: домен паузы не имеет (IA-решение в отчёте);
// API ?status=<один статус> сохранён для совместимости (e2e).
// Фильтры P1-01/P1-03 (ответственный, направление, тип) — вторичные
// строки под табами, без изменений.

type OrdersPage = { orders: OrderRow[]; hasMore: boolean; counts: Record<'all' | OrderStatus, number> }

// Табы-группы шапки §4.2: ключ → подпись; счётчик группы считается
// клиентски из counts по статусам (API отдаёт распределение найденного).
const STATUS_TABS: Array<{ key: 'all' | 'active' | 'completed' | 'cancelled'; label: string }> = [
  { key: 'all', label: 'Все' },
  { key: 'active', label: 'Активные' },
  { key: 'completed', label: 'Завершённые' },
  { key: 'cancelled', label: 'Отменённые' },
]

function groupCount(counts: OrdersPage['counts'] | null, key: string): number | null {
  if (!counts) return null
  if (key === 'all') return counts.all
  if (key === 'active') return ORDER_ACTIVE_STATUSES.reduce((n, s) => n + counts[s], 0)
  return counts[key as OrderStatus]
}

export function OrdersList() {
  const { toast } = useToast()

  const [orders, setOrders] = useState<OrderRow[]>([])
  const [counts, setCounts] = useState<OrdersPage['counts'] | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  // Таб-группа статуса (§4.2): 'all' не шлётся в API, группы — ?status=
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'completed' | 'cancelled'>('all')
  const [sort, setSort] = useState('newest')
  // P1-01: фильтр ответственного («Мои / Все / Без ответственного»)
  const [assignedFilter, setAssignedFilter] = useState<'all' | 'mine' | 'unassigned'>('all')
  const [q, setQ] = useState('')
  const debouncedQ = useDebouncedValue(q, 400)
  // P1-03: фильтры направления и типа («Китай → Москва, Море»)
  const [originFilter, setOriginFilter] = useState('')
  const [destinationFilter, setDestinationFilter] = useState('')
  const debouncedOrigin = useDebouncedValue(originFilter, 400)
  const debouncedDestination = useDebouncedValue(destinationFilter, 400)
  const [transportFilter, setTransportFilter] = useState('all')
  // Счётчик версий: сброс списка после создания заявки без копирования
  // load-логики в обработчик.
  const [version, setVersion] = useState(0)
  // Страж гонок: печатание/смена фильтров порождает запросы быстрее,
  // чем приходят ответы — применяем только последний.
  const reqId = useRef(0)

  // Чистая выборка страницы: зависит только от параметров — смена любого
  // из них пересоздаёт функцию и перезапускает эффект-сброс ниже.
  const fetchPage = useCallback(
    async (skip: number): Promise<OrdersPage> => {
      const params = new URLSearchParams()
      if (debouncedQ) params.set('q', debouncedQ)
      if (sort !== 'newest') params.set('sort', sort)
      if (statusFilter !== 'all') params.set('status', statusFilter)
      if (assignedFilter !== 'all') params.set('assigned', assignedFilter)
      // P1-03: направление и тип перевозки
      if (debouncedOrigin.trim()) params.set('origin', debouncedOrigin.trim())
      if (debouncedDestination.trim()) params.set('destination', debouncedDestination.trim())
      if (transportFilter !== 'all') params.set('transport', transportFilter)
      if (skip) params.set('skip', String(skip))
      const res = await fetch(`/api/admin/orders?${params.toString()}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Ошибка загрузки')
      return data
    },
    [debouncedQ, sort, statusFilter, assignedFilter, debouncedOrigin, debouncedDestination, transportFilter]
  )

  // Сброс списка: новый поиск/сортировка/таб или версия после создания.
  useEffect(() => {
    const id = ++reqId.current
    setLoading(true)
    fetchPage(0)
      .then((data) => {
        if (id !== reqId.current) return
        setOrders(data.orders)
        setHasMore(data.hasMore)
        setCounts(data.counts)
      })
      .catch((e) => {
        if (id !== reqId.current) return
        toast({
          title: 'Не удалось загрузить заявки',
          description: e instanceof Error ? e.message : '',
          variant: 'destructive',
        })
      })
      .finally(() => {
        if (id === reqId.current) setLoading(false)
      })
  }, [fetchPage, version, toast])

  const loadMore = async () => {
    if (loadingMore) return
    setLoadingMore(true)
    try {
      const data = await fetchPage(orders.length)
      setOrders((prev) => [...prev, ...data.orders])
      setHasMore(data.hasMore)
    } catch (e) {
      toast({
        title: 'Не удалось загрузить заявки',
        description: e instanceof Error ? e.message : '',
        variant: 'destructive',
      })
    } finally {
      setLoadingMore(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* §4.2 шапка списка: заголовок Bold + главное действие Coral */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Заявки</h1>
        <OrderCreateDialog onCreated={() => setVersion((v) => v + 1)} />
      </div>

      {/* §4.2 табы-фильтры: активный — Ink/Medium, подчёркивание Coral;
          неактивные — приглушённые. Число — распределение найденного
          (та же семантика, что была у статусных кнопок). */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b pb-1">
        {STATUS_TABS.map((t) => {
          const n = groupCount(counts, t.key)
          const active = statusFilter === t.key
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setStatusFilter(t.key)}
              aria-current={active ? 'true' : undefined}
              className={cn(
                '-mb-1 border-b-2 pb-1.5 text-sm transition-colors',
                active
                  ? 'border-primary font-medium text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              {t.label}
              {n !== null && <span className="ml-1.5 tabular-nums text-muted-foreground">{n}</span>}
            </button>
          )
        })}
      </div>

      {/* Ж4: поиск + сортировка (эталонный паттерн списка) */}
      <OrdersToolbar q={q} onQChange={setQ} sort={sort} onSortChange={setSort} />

      {/* P1-01: фильтр ответственного (Мои / Все / Без ответственного) */}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={assignedFilter === 'all' ? 'default' : 'outline'}
          onClick={() => setAssignedFilter('all')}
        >
          Ответственный: все
        </Button>
        <Button
          size="sm"
          variant={assignedFilter === 'mine' ? 'default' : 'outline'}
          onClick={() => setAssignedFilter('mine')}
        >
          Мои
        </Button>
        <Button
          size="sm"
          variant={assignedFilter === 'unassigned' ? 'default' : 'outline'}
          onClick={() => setAssignedFilter('unassigned')}
        >
          Без ответственного
        </Button>
      </div>

      {/* P1-03: фильтры направления и типа перевозки */}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          className="w-44"
          placeholder="Откуда (страна/город)"
          value={originFilter}
          onChange={(e) => setOriginFilter(e.target.value)}
        />
        <span className="text-muted-foreground text-sm">→</span>
        <Input
          className="w-44"
          placeholder="Куда (страна/город)"
          value={destinationFilter}
          onChange={(e) => setDestinationFilter(e.target.value)}
        />
        <Select value={transportFilter} onValueChange={setTransportFilter}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Тип: любой</SelectItem>
            {TRANSPORT_TYPE_CODES.map((t) => (
              <SelectItem key={t} value={t}>
                {TRANSPORT_TYPE_LABELS[t]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {(originFilter || destinationFilter || transportFilter !== 'all') && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setOriginFilter('')
              setDestinationFilter('')
              setTransportFilter('all')
            }}
          >
            <X className="size-4" />
            Сбросить
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm py-8 justify-center">
          <Loader2 className="size-4 animate-spin" />
          Загрузка…
        </div>
      ) : orders.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground text-sm">
          {q
            ? `Ничего не найдено по «${q}».`
            : statusFilter === 'all'
              ? 'Заявок пока нет — создайте первую.'
              : `В группе «${STATUS_TABS.find((t) => t.key === statusFilter)?.label}» заявок нет.`}
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {orders.map((o) => (
            <OrderCard key={o.id} order={o} />
          ))}
          {hasMore && (
            <Button variant="outline" onClick={loadMore} disabled={loadingMore}>
              {loadingMore && <Loader2 className="size-4 animate-spin" />}
              Показать ещё
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
