'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { FilePlus2, Loader2, Search, Users, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { TRANSPORT_TYPE_CODES, TRANSPORT_TYPE_LABELS } from '@/lib/route-fields'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { formatPhoneInput, normalizePhone } from '@/lib/phone'
import {
  ORDER_STATUSES,
  ORDER_STATUS_LABELS,
  CARGO_PROFILES,
  CARGO_PROFILE_LABELS,
  STAGE_STATUS_LABELS,
  type OrderStatus,
  type StageStatus,
} from '@/lib/order-constants'

// ─── Типы ответов API (узкая выжимка, всё как в роутах) ───────

type OrderRow = {
  id: string
  number: string
  status: OrderStatus
  incoterm: string | null
  cargoProfile: string
  createdAt: string
  // P1-01: ответственный менеджер и маркер движения
  assignee: { id: string; name: string } | null
  updatedAt: string
  customer: { id: string; name: string; phone: string | null }
  contract: { id: string; number: number }
  legalEntity: { id: string; name: string }
  stagesTotal: number
  stagesDone: number
  stagesProblem: number
  // Ж4: ближайший незавершённый этап (null — всё завершено) и просрочка
  nearestStage: {
    code: string
    name: string
    status: StageStatus
    plannedDate: string | null
    contractorName: string | null
  } | null
  overdue: boolean
}

type OrdersPage = { orders: OrderRow[]; hasMore: boolean; counts: Record<'all' | OrderStatus, number> }

type CustomerRow = { id: string; name: string; phone: string | null }
type LegalEntityRow = { id: string; name: string }

export function OrdersList() {
  const router = useRouter()
  const { toast } = useToast()

  const [orders, setOrders] = useState<OrderRow[]>([])
  const [counts, setCounts] = useState<OrdersPage['counts'] | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [statusFilter, setStatusFilter] = useState<'all' | OrderStatus>('all')
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

  const [customers, setCustomers] = useState<CustomerRow[]>([])
  const [legalEntities, setLegalEntities] = useState<LegalEntityRow[]>([])

  const [createOpen, setCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  // Форма создания: клиент либо существующий (id), либо новый (имя+телефон)
  const [customerId, setCustomerId] = useState<string>('')
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [customerEmail, setCustomerEmail] = useState('')
  const [isNewCustomer, setIsNewCustomer] = useState(false)
  const [legalEntityId, setLegalEntityId] = useState('')
  const [incoterm, setIncoterm] = useState('none')
  const [hsCode, setHsCode] = useState('')
  const [cargoProfile, setCargoProfile] = useState('standard')

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

  // Справочники для диалога создания — грузим один раз при открытии
  useEffect(() => {
    if (!createOpen || customers.length || legalEntities.length) return
    fetch('/api/admin/customers')
      .then((r) => r.json())
      .then((d) => setCustomers(d.customers ?? []))
      .catch(() => {})
    fetch('/api/admin/legal-entities')
      .then((r) => r.json())
      .then((d) => setLegalEntities(d.legalEntities ?? []))
      .catch(() => {})
  }, [createOpen, customers.length, legalEntities.length])

  const handleCreate = async () => {
    if (isNewCustomer && !customerName.trim()) {
      toast({ title: 'Укажите имя клиента', variant: 'destructive' })
      return
    }
    if (!isNewCustomer && !customerId) {
      toast({ title: 'Выберите клиента', variant: 'destructive' })
      return
    }
    if (!legalEntityId) {
      toast({ title: 'Выберите юрлицо', variant: 'destructive' })
      return
    }
    setCreating(true)
    try {
      const res = await fetch('/api/admin/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(isNewCustomer
            ? {
                customerName: customerName.trim(),
                customerPhone: customerPhone ? normalizePhone(customerPhone) : null,
                customerEmail: customerEmail.trim() || null,
              }
            : { customerId }),
          legalEntityId,
          incoterm: incoterm === 'none' ? null : incoterm,
          hsCode: hsCode.trim() || null,
          cargoProfile,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Не удалось создать заявку')

      toast({
        title: `Заявка ${data.order.number} создана`,
        description: 'Обязательные этапы подставлены автоматически',
      })
      setCreateOpen(false)
      resetForm()
      setVersion((v) => v + 1)
      router.refresh()
    } catch (e) {
      toast({
        title: 'Ошибка создания',
        description: e instanceof Error ? e.message : '',
        variant: 'destructive',
      })
    } finally {
      setCreating(false)
    }
  }

  const resetForm = () => {
    setCustomerId('')
    setCustomerName('')
    setCustomerPhone('')
    setCustomerEmail('')
    setIsNewCustomer(false)
    setIncoterm('none')
    setHsCode('')
    setCargoProfile('standard')
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Заявки</h1>
          <p className="text-sm text-muted-foreground">
            Поиск по номеру, клиенту, телефону и ТН ВЭД; ближайший этап,
            исполнитель и просрочка — по колонкам
          </p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <FilePlus2 className="size-4" />
              Новая заявка
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Новая заявка</DialogTitle>
              <DialogDescription>
                Договор пары клиент+юрлицо подставится автоматически, обязательные
                этапы — из каталога.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label>Клиент</Label>
                {isNewCustomer ? (
                  <div className="grid gap-2">
                    <div className="flex gap-2">
                      <Input
                        placeholder="Название или имя"
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setIsNewCustomer(false)}
                      >
                        Из списка
                      </Button>
                    </div>
                    <Input
                      type="tel"
                      placeholder="Телефон +7 (…) — не обязателен"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(formatPhoneInput(e.target.value))}
                    />
                    <Input
                      type="email"
                      placeholder="Email — не обязателен"
                      value={customerEmail}
                      onChange={(e) => setCustomerEmail(e.target.value)}
                    />
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Select value={customerId} onValueChange={setCustomerId}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Выберите клиента" />
                      </SelectTrigger>
                      <SelectContent>
                        <div className="max-h-64 overflow-y-auto">
                          {customers.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.name}
                              {c.phone ? ` · ${c.phone}` : ''}
                            </SelectItem>
                          ))}
                        </div>
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setIsNewCustomer(true)
                        setCustomerId('')
                      }}
                    >
                      <Users className="size-4" />
                      Новый
                    </Button>
                  </div>
                )}
              </div>

              <div className="grid gap-2">
                <Label>Наше юрлицо</Label>
                <Select value={legalEntityId} onValueChange={setLegalEntityId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Юрлицо договора" />
                  </SelectTrigger>
                  <SelectContent>
                    {legalEntities.map((le) => (
                      <SelectItem key={le.id} value={le.id}>
                        {le.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label>Инкотермс</Label>
                  <Select value={incoterm} onValueChange={setIncoterm}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">—</SelectItem>
                      {['EXW', 'FCA', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP', 'FAS', 'FOB', 'CFR', 'CIF'].map(
                        (t) => (
                          <SelectItem key={t} value={t}>
                            {t}
                          </SelectItem>
                        )
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>Груз</Label>
                  <Select value={cargoProfile} onValueChange={setCargoProfile}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CARGO_PROFILES.map((p) => (
                        <SelectItem key={p} value={p}>
                          {CARGO_PROFILE_LABELS[p]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="hsCode">Код ТН ВЭД</Label>
                <Input
                  id="hsCode"
                  placeholder="Например, 8703 — необязательно"
                  value={hsCode}
                  onChange={(e) => setHsCode(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleCreate} disabled={creating}>
                {creating && <Loader2 className="size-4 animate-spin" />}
                Создать
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Ж4: поиск + сортировка (эталонный паттерн списка) */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pr-8 pl-8"
            placeholder="Номер, клиент, телефон, ТН ВЭД…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          {q && (
            <button
              type="button"
              aria-label="Очистить поиск"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
              onClick={() => setQ('')}
            >
              <X className="size-4" />
            </button>
          )}
        </div>
        <Select value={sort} onValueChange={setSort}>
          <SelectTrigger className="w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Сначала новые</SelectItem>
            <SelectItem value="oldest">Сначала старые</SelectItem>
            <SelectItem value="number_asc">№ по возрастанию</SelectItem>
            <SelectItem value="number_desc">№ по убыванию</SelectItem>
            <SelectItem value="stale">Давно без движения</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Фильтр по статусу (роадмап 8.1) со счётчиками найденного */}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={statusFilter === 'all' ? 'default' : 'outline'}
          onClick={() => setStatusFilter('all')}
        >
          Все{counts ? ` · ${counts.all}` : ''}
        </Button>
        {ORDER_STATUSES.map((s) => (
          <Button
            key={s}
            size="sm"
            variant={statusFilter === s ? 'default' : 'outline'}
            onClick={() => setStatusFilter(s)}
          >
            {ORDER_STATUS_LABELS[s]}
            {counts ? ` · ${counts[s]}` : ''}
          </Button>
        ))}
      </div>

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
              : `Заявок со статусом «${ORDER_STATUS_LABELS[statusFilter]}» нет.`}
        </Card>
      ) : (
        <div className="grid gap-2">
          {orders.map((o) => (
            <Link key={o.id} href={`/admin/orders/${o.id}`} className="block group">
              <Card className="p-4 flex flex-wrap items-center gap-x-6 gap-y-2 transition-colors group-hover:border-ring">
                <div className="font-mono font-semibold text-lg min-w-20">{o.number}</div>
                <div className="min-w-40 flex-1">
                  <div className="font-medium truncate">{o.customer.name}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {o.legalEntity.name} · договор {o.contract.number}
                    {o.incoterm ? ` · ${o.incoterm}` : ''}
                  </div>
                </div>
                {/* Ж4: ближайший этап с планом и статусом */}
                <div className="min-w-44">
                  <div className="text-xs text-muted-foreground">Ближайший этап</div>
                  <div className="text-sm font-medium truncate">
                    {o.nearestStage ? o.nearestStage.name : 'Все этапы завершены'}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {o.nearestStage
                      ? `${STAGE_STATUS_LABELS[o.nearestStage.status] ?? o.nearestStage.status}${
                          o.nearestStage.plannedDate
                            ? ' · план ' + new Date(o.nearestStage.plannedDate).toLocaleDateString('ru-RU')
                            : ''
                        }`
                      : '—'}
                  </div>
                </div>
                {/* Ж4: исполнитель ближайшего этапа */}
                <div className="min-w-32">
                  <div className="text-xs text-muted-foreground">Исполнитель</div>
                  <div className="text-sm truncate">
                    {o.nearestStage?.contractorName ?? (
                      <span className="text-muted-foreground">— не назначен</span>
                    )}
                  </div>
                </div>
                {/* P1-01: колонка ответственного в списке */}
                <div className="min-w-28">
                  <div className="text-xs text-muted-foreground">Ответственный</div>
                  <div className="text-sm truncate">
                    {o.assignee?.name ?? <span className="text-muted-foreground">—</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground tabular-nums">
                  Этапы: {o.stagesDone}/{o.stagesTotal}
                  {o.stagesProblem > 0 && (
                    <Badge variant="destructive">{o.stagesProblem} пробл.</Badge>
                  )}
                  {/* Ж4: просрочка — незавершённый этап с планом раньше сегодня */}
                  {o.overdue && <Badge variant="destructive">Просрочка</Badge>}
                </div>
                <OrderStatusBadge status={o.status} />
              </Card>
            </Link>
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

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const map: Record<OrderStatus, string> = {
    calculating: 'bg-muted text-muted-foreground',
    confirmed: 'bg-info text-info-foreground',
    in_progress: 'bg-warning text-warning-foreground',
    completed: 'bg-success text-success-foreground',
    cancelled: 'bg-destructive text-destructive-foreground',
  }
  return (
    <Badge className={`${map[status]} border-transparent`} variant="outline">
      {ORDER_STATUS_LABELS[status]}
    </Badge>
  )
}
