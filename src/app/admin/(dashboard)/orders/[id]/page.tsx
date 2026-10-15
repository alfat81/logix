'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Loader2,
  Lock,
  Pencil,
  Plus,
  Trash2,
  Truck,
  UserX,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import { CargoGroups, CargoFormFields } from '@/components/admin/CargoGroups'
import { ActivityFeed, type ActivityRow } from '@/components/admin/ActivityFeed'
import { Breadcrumbs } from '@/components/admin/Breadcrumbs'
import { NoteForm } from '@/components/admin/NoteForm'
import {
  BrokerLinksSection,
  type BrokerLinkRow,
  type BrokerEstimateRow,
} from '@/components/admin/BrokerLinksSection'
import {
  buildLeadCargo,
  cargoFormFromData,
  EMPTY_LEAD_CARGO_FORM,
  QUOTE_PRIORITY_FITS,
  QUOTE_PRIORITY_FIT_LABELS,
  TRANSPORT_TYPES,
  readLeadCargo,
  type LeadCargoForm,
  type QuotePriorityFit,
} from '@/lib/leads'
import {
  ORDER_STATUSES,
  ORDER_STATUS_LABELS,
  STAGE_STATUSES,
  STAGE_STATUS_LABELS,
  CARGO_PROFILE_LABELS,
  type OrderStatus,
  type StageStatus,
  type CargoProfile,
} from '@/lib/order-constants'

type StageRow = {
  id: string
  stageCode: string
  name: string
  isMandatory: boolean
  sequence: number
  status: StageStatus
  plannedDate: string | null
  actualDate: string | null
  // Исполнитель этапа (Г3): приходит внутри карточки заявки,
  // публичная проекция без пароля.
  contractor: { id: string; companyName: string; phone: string; isActive: boolean } | null
}

// Пул для назначения на этап (Г5): только активные — исключённому
// сервер ответит 409 (мягкое исключение, Г3). isActive нужен для
// пометки «исключён», если такой уже назначен на этапе.
type PoolRow = { id: string; companyName: string; phone: string; isActive: boolean }

type OrderFull = {
  id: string
  number: string
  status: OrderStatus
  incoterm: string | null
  cargoProfile: CargoProfile
  hsCode: string | null
  createdAt: string
  // Ж1: суть заявки. cargoInfo — форма бланка (как у лида),
  // quoteSnapshot — снимок условий сделки; оба — копии с лида
  // при конвертации, дальше — источник правды сама заявка.
  cargoInfo: Record<string, unknown> | null
  quoteSnapshot: QuoteSnapshot | null
  // Ж1: лид-источник (заявки без лида — leadId null, Б3)
  leadId: string | null
  // Д: лид-источник несёт брокеров расчёта с оценками (перенос в
  // заявку при конвертации В4 — оценка живёт на связи лида)
  lead: {
    id: string
    createdAt: string
    brokers: {
      id: string
      broker: { id: string; companyName: string; isActive: boolean }
      estimate: BrokerEstimateRow | null
    }[]
  } | null
  // Д: брокеры заявки — видимость целиком (OrderBroker)
  brokers: BrokerLinkRow[]
  customer: { id: string; name: string; phone: string | null; email: string | null }
  contract: { id: string; number: number; legalEntity: { name: string } }
  legalEntity: { id: string; name: string }
  stages: StageRow[]
  // Ж2: лента событий — приходит внутри GET карточки (свежие сверху)
  activities: ActivityRow[]
}

// Снимок условий (структура — QuoteSnapshotSchema в lib/leads.ts);
// чтение толерантное: неизвестных/отсутствующих полец просто нет
type QuoteSnapshot = {
  description?: string
  transportModes?: string[] | null
  priceEstimate?: number
  etaDays?: number
  priorityFit?: string
} | null

// Состояние формы правки условий: всё строки (числа парсятся при
// сохранении), приоритет '' = не указан ('none' в селекте).
type QuoteForm = {
  description: string
  priceEstimate: string
  etaDays: string
  priorityFit: string
  modes: string[]
}

const EMPTY_QUOTE_FORM: QuoteForm = {
  description: '',
  priceEstimate: '',
  etaDays: '',
  priorityFit: '',
  modes: [],
}

const fmtMoney = (n: number): string => new Intl.NumberFormat('ru-RU').format(n) + ' ₽'

// Предзаполнение формы из снимка (замена — целиком, пустое = снято)
function quoteFormFromSnapshot(snap: QuoteSnapshot): QuoteForm {
  return {
    description: typeof snap?.description === 'string' ? snap.description : '',
    priceEstimate:
      typeof snap?.priceEstimate === 'number' && Number.isFinite(snap.priceEstimate)
        ? String(snap.priceEstimate)
        : '',
    etaDays:
      typeof snap?.etaDays === 'number' && Number.isFinite(snap.etaDays)
        ? String(snap.etaDays)
        : '',
    priorityFit:
      typeof snap?.priorityFit === 'string' &&
      (QUOTE_PRIORITY_FITS as readonly string[]).includes(snap.priorityFit)
        ? snap.priorityFit
        : '',
    modes: Array.isArray(snap?.transportModes)
      ? snap.transportModes.filter((m): m is string => typeof m === 'string')
      : [],
  }
}

type CatalogRow = { id: string; code: string; name: string; order: number; isMandatory: boolean }

const fmtDate = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleDateString('ru-RU') : '—'

export default function OrderPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { toast } = useToast()

  const [order, setOrder] = useState<OrderFull | null>(null)
  const [catalog, setCatalog] = useState<CatalogRow[]>([])
  const [pool, setPool] = useState<PoolRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busyStageId, setBusyStageId] = useState<string | null>(null)

  // Черновики плановых дат по этапам: коммит по blur (не по каждому
  // символу), откат — перезагрузкой карточки.
  const [plannedDrafts, setPlannedDrafts] = useState<Record<string, string>>({})

  const [addOpen, setAddOpen] = useState(false)
  const [addCode, setAddCode] = useState('')
  const [adding, setAdding] = useState(false)

  // ── Ж1: правка сути заявки ─────────────────────────────────
  // Форма груза предзаполняется из cargoInfo (cargoFormFromData),
  // условия — из снимка; сохранение — полная замена (PATCH-семантика).
  const [cargoOpen, setCargoOpen] = useState(false)
  const [cargoForm, setCargoForm] = useState<LeadCargoForm>({ ...EMPTY_LEAD_CARGO_FORM })
  const [savingCargo, setSavingCargo] = useState(false)

  const [quoteOpen, setQuoteOpen] = useState(false)
  const [quoteForm, setQuoteForm] = useState<QuoteForm>({ ...EMPTY_QUOTE_FORM })
  const [savingQuote, setSavingQuote] = useState(false)

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

  useEffect(() => {
    if (!catalog.length) {
      fetch('/api/admin/stage-catalog')
        .then((r) => r.json())
        .then((d) => setCatalog(d.catalog ?? []))
        .catch(() => {})
    }
  }, [catalog.length])

  // Пул активных подрядчиков для селекта исполнителя (Г5): грузится
  // один раз вместе с карточкой — назначение происходит на каждом
  // этапе, пул общий.
  useEffect(() => {
    if (!pool.length) {
      fetch('/api/admin/contractors?active=true')
        .then((r) => readApiResponse<{ contractors: PoolRow[] }>(r))
        .then((d) => setPool(d.contractors ?? []))
        .catch(() => {})
    }
  }, [pool.length])

  if (loading || !order) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground text-sm py-16 justify-center">
        <Loader2 className="size-4 animate-spin" />
        Загрузка…
      </div>
    )
  }

  // Что можно добавить: этапы каталога, которых ещё нет в заявке
  // (обязательные уже подставлены автоматически — в списке их не будет)
  const availableStages = catalog.filter(
    (c) => !order.stages.some((s) => s.stageCode === c.code)
  )

  const patchOrder = async (body: Record<string, unknown>) => {
    const res = await fetch(`/api/admin/orders/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await readApiResponse<{ message?: string; error?: string }>(res)
    if (!res.ok) {
      toast({ title: data.error || 'Ошибка', variant: 'destructive' })
      return
    }
    toast({ title: data.message || 'Обновлено' })
    load()
  }

  // ── Ж1: диалоги правки груза и условий ───────────────────
  const openCargoEdit = () => {
    // readLeadCargo — толерантное чтение: чужая форма Json не уронит
    // форму правки (известные ключи подтянутся, остальные потеряются
    // при замене — бланк и есть источник правды после сохранения)
    setCargoForm(cargoFormFromData(readLeadCargo(order?.cargoInfo)))
    setCargoOpen(true)
  }

  const saveCargo = async () => {
    setSavingCargo(true)
    try {
      // buildLeadCargo сам отбрасывает пустые поля; null = очистить
      await patchOrder({ cargoInfo: buildLeadCargo(cargoForm) })
      setCargoOpen(false)
    } finally {
      setSavingCargo(false)
    }
  }

  const openQuoteEdit = () => {
    setQuoteForm(quoteFormFromSnapshot(order?.quoteSnapshot ?? null))
    setQuoteOpen(true)
  }

  const saveQuote = async () => {
    const description = quoteForm.description.trim()
    const price = quoteForm.priceEstimate.trim()
      ? Number(quoteForm.priceEstimate.replace(',', '.'))
      : null
    const eta = quoteForm.etaDays.trim() ? Number(quoteForm.etaDays.replace(',', '.')) : null
    if (price !== null && (!Number.isInteger(price) || price <= 0)) {
      toast({ title: 'Стоимость — целое число рублей, больше нуля', variant: 'destructive' })
      return
    }
    if (eta !== null && (!Number.isInteger(eta) || eta <= 0)) {
      toast({ title: 'Срок — целое число дней, больше нуля', variant: 'destructive' })
      return
    }
    // Пустая форма = снять условия (quoteSnapshot: null); иначе —
    // собираем объект из заполненного, как buildLeadCargo у груза
    const snapshot =
      description || price !== null || eta !== null || quoteForm.priorityFit || quoteForm.modes.length
        ? {
            ...(description ? { description } : {}),
            ...(quoteForm.modes.length ? { transportModes: quoteForm.modes } : {}),
            ...(price !== null ? { priceEstimate: price } : {}),
            ...(eta !== null ? { etaDays: eta } : {}),
            ...(quoteForm.priorityFit ? { priorityFit: quoteForm.priorityFit } : {}),
          }
        : null
    setSavingQuote(true)
    try {
      await patchOrder({ quoteSnapshot: snapshot })
      setQuoteOpen(false)
    } finally {
      setSavingQuote(false)
    }
  }

  const patchStage = async (stageId: string, body: Record<string, unknown>) => {
    setBusyStageId(stageId)
    try {
      const res = await fetch(`/api/admin/orders/${id}/stages/${stageId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await readApiResponse<{ message?: string; error?: string }>(res)
      if (!res.ok) {
        toast({ title: data.error || 'Ошибка', variant: 'destructive' })
        return
      }
      toast({ title: data.message || 'Этап обновлён' })
      load()
    } catch {
      toast({ title: 'Сеть недоступна', variant: 'destructive' })
    } finally {
      setBusyStageId(null)
    }
  }

  const deleteStage = async (stageId: string, name: string) => {
    setBusyStageId(stageId)
    try {
      const res = await fetch(`/api/admin/orders/${id}/stages/${stageId}`, {
        method: 'DELETE',
      })
      const data = await readApiResponse<{ error?: string }>(res)
      if (!res.ok) {
        // 403 «обязательный нельзя удалить» сюда не доходит теоретически
        // (кнопки нет), но сервер — источник правды, покажем как есть
        toast({ title: data.error || 'Не удалось удалить этап', variant: 'destructive' })
        return
      }
      toast({ title: `Этап «${name}» удалён` })
      load()
    } finally {
      setBusyStageId(null)
    }
  }

  // Перестановка соседних необязательных этапов (роадмап, раздел 3):
  // порядок обязательного ядра фиксирован, порядок надстройки — на
  // усмотрение менеджера.
  const moveStage = async (stage: StageRow, dir: -1 | 1) => {
    const sorted = [...order.stages].sort((a, b) => a.sequence - b.sequence)
    const idx = sorted.findIndex((s) => s.id === stage.id)
    const target = sorted[idx + dir]
    if (!target || target.isMandatory || stage.isMandatory) return
    await Promise.all([
      patchStage(stage.id, { sequence: target.sequence }),
      patchStage(target.id, { sequence: stage.sequence }),
    ])
  }

  const addStage = async () => {
    if (!addCode) {
      toast({ title: 'Выберите этап', variant: 'destructive' })
      return
    }
    setAdding(true)
    try {
      const res = await fetch(`/api/admin/orders/${id}/stages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stageCode: addCode }),
      })
      const data = await readApiResponse<{ stage: { stageCode: string }; error?: string }>(res)
      if (!res.ok) throw new Error(data.error || 'Не удалось добавить этап')
      toast({ title: `Этап «${data.stage.stageCode}» добавлен` })
      setAddOpen(false)
      setAddCode('')
      load()
    } catch (e) {
      toast({
        title: 'Ошибка',
        description: e instanceof Error ? e.message : '',
        variant: 'destructive',
      })
    } finally {
      setAdding(false)
    }
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

  // ── Исполнитель этапа (Г5): селект из активного пула ──────────
  // Назначенному-исключённому — особый пункт с пометкой: назначение
  // остаётся видимым (мягкое исключение не рвёт текущее), но выбрать
  // его заново нельзя — сервер ответит 409 (Г3).
  const stageOptions = (s: StageRow): PoolRow[] => {
    const options = [...pool]
    if (s.contractor && !options.some((p) => p.id === s.contractor!.id)) {
      options.push({
        id: s.contractor.id,
        companyName: s.contractor.companyName,
        phone: s.contractor.phone,
        isActive: s.contractor.isActive,
      })
    }
    return options
  }

  const assignContractor = (s: StageRow, contractorId: string) =>
    patchStage(s.id, { contractorId })

  const unassignContractor = (s: StageRow) =>
    // Снятие статус этапа не трогает (Г3): только исполнитель.
    patchStage(s.id, { contractorId: null })

  // ── Плановая дата: черновик по этапу, коммит по blur ──────────
  const plannedValue = (s: StageRow): string =>
    plannedDrafts[s.id] ?? (s.plannedDate ? s.plannedDate.slice(0, 10) : '')

  const commitPlanned = (s: StageRow) => {
    const draft = plannedValue(s)
    const orig = s.plannedDate ? s.plannedDate.slice(0, 10) : ''
    if (draft === orig) return
    // Дата-план — поле менеджера (Г4: факт ставит сервер при done).
    // Полная UTC-полночь: дата-семантика без сдвига между поясами.
    patchStage(s.id, { plannedDate: draft ? `${draft}T00:00:00.000Z` : null })
  }

  return (
    <div className="grid gap-4">
      {/* Ж7: крошки вместо кнопки «назад» — путь виден целиком
          (Главная / Заявки / текущая заявка), а не только на один
          уровень вверх. */}
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

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Условия перевозки</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <Info label="Клиент" value={order.customer.name} />
          {/* Ж1: контакты клиента прямо в карточке — менеджеру не
              ходить за ними в справочник */}
          <Info label="Телефон клиента" value={order.customer.phone ?? '—'} />
          <Info label="Email клиента" value={order.customer.email ?? '—'} />
          <Info label="Юрлицо" value={order.legalEntity.name} />
          <Info label="Договор" value={`№ ${order.contract.number}`} />
          <Info label="Создана" value={fmtDate(order.createdAt)} />
          <Info label="Инкотермс" value={order.incoterm ?? '—'} />
          <Info label="ТН ВЭД" value={order.hsCode ?? '—'} />
          <Info label="Груз" value={CARGO_PROFILE_LABELS[order.cargoProfile]} />
          <Info
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
            <div className="font-medium">Конвертирована из лида от {fmtDate(order.lead.createdAt)}</div>
            <div className="text-sm text-muted-foreground">
              Груз и условия скопированы снимком — заявка живёт независимо от лида
            </div>
          </div>
          <Button variant="outline" asChild>
            <Link href={`/admin/leads/${order.lead.id}`}>
              Лид-источник
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </Card>
      )}

      {/* ── Ж1: суть заявки — груз и маршрут ─────────────────────── */}
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Груз и маршрут</CardTitle>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={openCargoEdit}
            title="Править груз и маршрут"
          >
            <Pencil className="size-4" />
          </Button>
        </CardHeader>
        <CardContent>
          <CargoGroups
            cargoInfo={order.cargoInfo}
            emptyText="Груз и маршрут не заполнены — у заявки без лида бланк пуст, заполните правкой"
          />
        </CardContent>
      </Card>

      {/* ── Ж1: суть заявки — условия сделки ─────────────────────── */}
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Условия сделки</CardTitle>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={openQuoteEdit}
            title="Править условия сделки"
          >
            <Pencil className="size-4" />
          </Button>
        </CardHeader>
        <CardContent>
          {order.quoteSnapshot &&
          Boolean(
            order.quoteSnapshot.description ||
              order.quoteSnapshot.priceEstimate != null ||
              order.quoteSnapshot.etaDays != null ||
              order.quoteSnapshot.priorityFit ||
              (Array.isArray(order.quoteSnapshot.transportModes) &&
                order.quoteSnapshot.transportModes.length)
          ) ? (
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <div className="min-w-52 flex-1">
                {order.quoteSnapshot.description && (
                  <div className="font-medium break-words">{order.quoteSnapshot.description}</div>
                )}
                <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-2 mt-1">
                  {Array.isArray(order.quoteSnapshot.transportModes) &&
                    order.quoteSnapshot.transportModes.length > 0 && (
                      <span className="flex gap-1">
                        {order.quoteSnapshot.transportModes.map((m) => (
                          <Badge key={m} variant="outline" className="text-xxs">
                            {m}
                          </Badge>
                        ))}
                      </span>
                    )}
                  {order.quoteSnapshot.etaDays != null && (
                    <span>срок: {order.quoteSnapshot.etaDays} дн.</span>
                  )}
                  {order.quoteSnapshot.priorityFit && (
                    <span>
                      · ориентир:{' '}
                      {QUOTE_PRIORITY_FIT_LABELS[order.quoteSnapshot.priorityFit as QuotePriorityFit] ??
                        order.quoteSnapshot.priorityFit}
                    </span>
                  )}
                </div>
              </div>
              {order.quoteSnapshot.priceEstimate != null && (
                <div className="font-semibold tabular-nums whitespace-nowrap">
                  {fmtMoney(order.quoteSnapshot.priceEstimate)}
                </div>
              )}
            </div>
          ) : (
            <span className="text-muted-foreground text-sm">
              Условия не указаны — вариант расчёта не выбран или заявка создана вручную
            </span>
          )}
        </CardContent>
      </Card>

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

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Этапы</h2>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
            <Plus className="size-4" />
            Добавить этап
          </Button>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Добавить этап из каталога</DialogTitle>
              <DialogDescription>
                Необязательные этапы поверх обязательного ядра. Обязательные уже
                в заявке и удалить их нельзя.
              </DialogDescription>
            </DialogHeader>
            <Select value={addCode} onValueChange={setAddCode}>
              <SelectTrigger>
                <SelectValue placeholder="Выберите этап" />
              </SelectTrigger>
              <SelectContent>
                {availableStages.length === 0 ? (
                  <div className="text-sm text-muted-foreground px-2 py-3">
                    Все этапы каталога уже в заявке
                  </div>
                ) : (
                  availableStages.map((c) => (
                    <SelectItem key={c.code} value={c.code}>
                      {c.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            <DialogFooter>
              <Button onClick={addStage} disabled={adding || !addCode}>
                {adding && <Loader2 className="size-4 animate-spin" />}
                Добавить
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-2">
        {[...order.stages]
          .sort((a, b) => a.sequence - b.sequence)
          .map((s, i, arr) => (
            <Card
              key={s.id}
              className={
                s.isMandatory
                  ? 'p-4 border-l-4 border-l-primary/70'
                  : 'p-4 border-l-4 border-l-transparent'
              }
            >
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold tabular-nums">
                  {s.sequence}
                </div>
                <div className="min-w-44 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{s.name}</span>
                    {s.isMandatory ? (
                      <Badge variant="outline" className="gap-1 text-xxs">
                        <Lock className="size-3" />
                        обязательный
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-xxs text-muted-foreground">
                        дополнительный
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground flex items-center gap-3 mt-0.5">
                    <span className="flex items-center gap-1">
                      <CheckCircle2 className="size-3" />
                      факт: {fmtDate(s.actualDate)}
                    </span>
                  </div>
                </div>

                <StageStatusBadge status={s.status} />

                <Select
                  value={s.status}
                  onValueChange={(v) => patchStage(s.id, { status: v })}
                  disabled={busyStageId === s.id}
                >
                  <SelectTrigger size="sm" className="w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STAGE_STATUSES.map((st) => (
                      <SelectItem key={st} value={st}>
                        {STAGE_STATUS_LABELS[st]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <div className="flex items-center gap-1">
                  {!s.isMandatory && (
                    <>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        disabled={busyStageId === s.id || i === 0 || arr[i - 1]?.isMandatory}
                        onClick={() => moveStage(s, -1)}
                        title="Выше (только среди дополнительных)"
                      >
                        <ChevronUp className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        disabled={
                          busyStageId === s.id || i === arr.length - 1 || arr[i + 1]?.isMandatory
                        }
                        onClick={() => moveStage(s, 1)}
                        title="Ниже (только среди дополнительных)"
                      >
                        <ChevronDown className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 text-destructive hover:text-destructive"
                        disabled={busyStageId === s.id}
                        onClick={() => deleteStage(s.id, s.name)}
                        title="Удалить этап"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </>
                  )}
                </div>
              </div>

              {/* ── Исполнитель + плановая дата (Г5, назначение из Г3) ── */}
              <div className="flex flex-wrap items-center gap-3 pt-2 mt-1 border-t">
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Truck className="size-3.5" />
                  Исполнитель
                </span>
                {pool.length === 0 && !s.contractor ? (
                  <span className="text-xs text-muted-foreground">
                    Пул пуст — назначать некого
                  </span>
                ) : (
                  <>
                    <Select
                      value={s.contractor?.id ?? ''}
                      onValueChange={(v) => assignContractor(s, v)}
                      disabled={busyStageId === s.id}
                    >
                      <SelectTrigger size="sm" className="w-60">
                        <SelectValue placeholder="Не назначен" />
                      </SelectTrigger>
                      <SelectContent>
                        <div className="max-h-64 overflow-y-auto">
                          {stageOptions(s).map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.companyName}
                              {!p.isActive ? ' · исключён' : ''}
                            </SelectItem>
                          ))}
                        </div>
                      </SelectContent>
                    </Select>
                    {s.contractor && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-destructive hover:text-destructive"
                        disabled={busyStageId === s.id}
                        onClick={() => unassignContractor(s)}
                        title="Снять подрядчика — назначение убирается, статус этапа не меняется"
                      >
                        <UserX className="size-3.5" />
                        Снять
                      </Button>
                    )}
                  </>
                )}
                <div className="flex items-center gap-1.5 ml-auto">
                  <CalendarDays className="size-3.5 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">План</span>
                  <Input
                    type="date"
                    className="h-7 w-36 text-xs"
                    value={plannedValue(s)}
                    onChange={(e) =>
                      setPlannedDrafts((d) => ({ ...d, [s.id]: e.target.value }))
                    }
                    onBlur={() => commitPlanned(s)}
                    disabled={busyStageId === s.id}
                  />
                </div>
              </div>
            </Card>
          ))}
      </div>

      {/* ── Ж3: внутренняя заметка — пишется в ленту, видна только
          сотрудникам (подрядчику/клиенту isInternal не отдаётся) ── */}
      <NoteForm targetType="order" targetId={String(id)} onAdded={load} />

      {/* ── Ж2: лента событий — хроника заявки (статусы, суть,
          этапы, исполнители) от сотрудников и подрядчиков ──── */}
      <ActivityFeed
        activities={order.activities}
        emptyText="Событий пока нет — журнал начнётся с первого действия"
      />

      {/* ── Ж1: диалог правки груза и маршрута ─────────────────────
          Тот же бланк, что у создания лида (CargoFormFields): заявки
          без лида заполняются с нуля, конвертированные — правятся
          поверх снимка. Сохранение — полная замена cargoInfo. */}
      <Dialog open={cargoOpen} onOpenChange={setCargoOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Груз и маршрут</DialogTitle>
            <DialogDescription>
              Бланк типовой заявки клиента. Пустые поля не сохраняются,
              очистка всех полей снимает груз с заявки.
            </DialogDescription>
          </DialogHeader>
          <CargoFormFields form={cargoForm} onChange={setCargoForm} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCargoOpen(false)}>
              Отмена
            </Button>
            <Button onClick={saveCargo} disabled={savingCargo}>
              {savingCargo && <Loader2 className="size-4 animate-spin" />}
              Сохранить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Ж1: диалог правки условий сделки ───────────────────────
          Снимок выбранного варианта у конвертированной заявки или
          ручной ввод у заявки без лида. Пустая форма = снять условия. */}
      <Dialog open={quoteOpen} onOpenChange={setQuoteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Условия сделки</DialogTitle>
            <DialogDescription>
              Согласованный способ доставки: описание, транспорт,
              стоимость и срок. У конвертированной заявки — снимок
              выбранного варианта расчёта лида.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="snap-desc">Описание</Label>
              <Textarea
                id="snap-desc"
                rows={2}
                placeholder="Например: Авиа Пекин → Шереметьево, прямой рейс"
                value={quoteForm.description}
                onChange={(e) => setQuoteForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <Label>Виды транспорта</Label>
              <div className="flex flex-wrap gap-2">
                {TRANSPORT_TYPES.map((t) => {
                  const active = quoteForm.modes.includes(t)
                  return (
                    <Button
                      key={t}
                      type="button"
                      size="sm"
                      variant={active ? 'default' : 'outline'}
                      onClick={() =>
                        setQuoteForm((f) => ({
                          ...f,
                          modes: active ? f.modes.filter((m) => m !== t) : [...f.modes, t],
                        }))
                      }
                    >
                      {t}
                    </Button>
                  )
                })}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="grid gap-2">
                <Label htmlFor="snap-price">Цена, ₽</Label>
                <Input
                  id="snap-price"
                  inputMode="numeric"
                  placeholder="150000"
                  value={quoteForm.priceEstimate}
                  onChange={(e) =>
                    setQuoteForm((f) => ({ ...f, priceEstimate: e.target.value }))
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="snap-eta">Срок, дней</Label>
                <Input
                  id="snap-eta"
                  inputMode="numeric"
                  placeholder="12"
                  value={quoteForm.etaDays}
                  onChange={(e) => setQuoteForm((f) => ({ ...f, etaDays: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label>Ориентир</Label>
                <Select
                  value={quoteForm.priorityFit || 'none'}
                  onValueChange={(v) =>
                    setQuoteForm((f) => ({ ...f, priorityFit: v === 'none' ? '' : v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">—</SelectItem>
                    {QUOTE_PRIORITY_FITS.map((p) => (
                      <SelectItem key={p} value={p}>
                        {QUOTE_PRIORITY_FIT_LABELS[p]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setQuoteOpen(false)}>
              Отмена
            </Button>
            <Button onClick={saveQuote} disabled={savingQuote}>
              {savingQuote && <Loader2 className="size-4 animate-spin" />}
              Сохранить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  )
}

function StageStatusBadge({ status }: { status: StageStatus }) {
  const map: Record<StageStatus, string> = {
    not_started: 'bg-muted text-muted-foreground',
    in_progress: 'bg-warning text-warning-foreground',
    done: 'bg-success text-success-foreground',
    problem: 'bg-destructive text-destructive-foreground',
  }
  return (
    <Badge variant="outline" className={`${map[status]} border-transparent`}>
      {STAGE_STATUS_LABELS[status]}
    </Badge>
  )
}
