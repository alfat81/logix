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
import { readApiResponse } from '@/lib/api-client'
import { TRANSPORT_TYPE_CODES, TRANSPORT_TYPE_LABELS } from '@/lib/route-fields'
import { LEAD_STATUS_LABELS, type LeadStatus } from '@/lib/leads'
import { LeadListCard, type LeadRow } from '@/components/admin/LeadListCard'
import { LeadCreateDialog } from '@/components/admin/LeadCreateDialog'
import { LeadsToolbar } from '@/components/admin/LeadsToolbar'
import { ListTabs, type ListTab } from '@/components/admin/ListTabs'

// P1-19 (v0.3.0) — экспорт сохранён: LeadStatusBadge живёт в
// собственном файле (v0.4.0), реэкспорт не ломает импорты
// (LeadCard, CustomerCard, GlobalSearch).
export { LeadStatusBadge } from '@/components/admin/LeadStatusBadge'

// ─── Список лидов (В5) — паттерн эталона Ж4 ────────────────────────
// v0.4.0 (BRANDBOOK §4.2–4.3, D25 — решение владельца): шапка раздела
// как у заявок — заголовок + главное действие Coral «Новый лид», табы
// ПО-СТАТУСНЫЕ с числами (API counts — распределение найденного по
// тому же поиску), поиск с лупой (LeadsToolbar, API ?q=); карточки —
// анатомия §4.3 без степпера (LeadListCard). Лид номера не имеет:
// идентификатор карточки — дата создания. Фильтры P1-01 (ответ-
// ственный, «давно без движения») и P1-03 (направление, тип) — без
// изменений. Состав таблицы счётчиков зеркалит заявки.

type LeadsPage = { leads: LeadRow[]; counts: Record<'all' | LeadStatus, number> }

// v0.4.0: табы по статусам воронки (D25). Ключ таба = ключ API ?status=.
const STATUS_TABS: Array<ListTab & { key: 'all' | LeadStatus }> = [
  { key: 'all', label: 'Все' },
  { key: 'new', label: 'Новые' },
  { key: 'calculated', label: 'Рассчитанные' },
  { key: 'won', label: 'Выигранные' },
  { key: 'lost', label: 'Отказ' },
]

export function LeadsList() {
  const { toast } = useToast()

  const [leads, setLeads] = useState<LeadRow[]>([])
  const [counts, setCounts] = useState<LeadsPage['counts'] | null>(null)
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<'all' | LeadStatus>('all')
  // P1-01: фильтр ответственного и сортировка «давно без движения»
  const [assignedFilter, setAssignedFilter] = useState<'all' | 'mine' | 'unassigned'>('all')
  const [sort, setSort] = useState('newest')
  // v0.4.0: поиск §4.2 (API ?q= — клиент, контакты, телефон, груз)
  const [q, setQ] = useState('')
  const debouncedQ = useDebouncedValue(q, 400)
  // P1-03: фильтры направления и типа (текст — с локальным debounce)
  const [originFilter, setOriginFilter] = useState('')
  const [destinationFilter, setDestinationFilter] = useState('')
  const debouncedOrigin = useDebouncedValue(originFilter, 400)
  const debouncedDestination = useDebouncedValue(destinationFilter, 400)
  const [transportFilter, setTransportFilter] = useState('all')
  // Счётчик версий: сброс списка после создания лида в диалоге.
  const [version, setVersion] = useState(0)
  // Страж гонок: применяем только последний ответ.
  const reqId = useRef(0)

  const fetchLeads = useCallback(async (): Promise<LeadsPage> => {
    const params = new URLSearchParams()
    if (debouncedQ) params.set('q', debouncedQ)
    if (statusFilter !== 'all') params.set('status', statusFilter)
    if (assignedFilter !== 'all') params.set('assigned', assignedFilter)
    if (sort !== 'newest') params.set('sort', sort)
    // P1-03: направление и тип перевозки
    if (debouncedOrigin.trim()) params.set('origin', debouncedOrigin.trim())
    if (debouncedDestination.trim()) params.set('destination', debouncedDestination.trim())
    if (transportFilter !== 'all') params.set('transport', transportFilter)
    const res = await fetch(`/api/admin/leads?${params.toString()}`)
    const data = await readApiResponse<LeadsPage & { error?: string }>(res)
    if (!res.ok) throw new Error(data.error || 'Ошибка загрузки')
    return data
  }, [debouncedQ, statusFilter, assignedFilter, sort, debouncedOrigin, debouncedDestination, transportFilter])

  useEffect(() => {
    const id = ++reqId.current
    setLoading(true)
    fetchLeads()
      .then((data) => {
        if (id !== reqId.current) return
        setLeads(data.leads)
        setCounts(data.counts)
      })
      .catch((e) => {
        if (id !== reqId.current) return
        toast({
          title: 'Не удалось загрузить запросы',
          description: e instanceof Error ? e.message : '',
          variant: 'destructive',
        })
      })
      .finally(() => {
        if (id === reqId.current) setLoading(false)
      })
  }, [fetchLeads, version, toast])

  return (
    <div className="flex flex-col gap-4">
      {/* §4.2 шапка списка: заголовок Bold + главное действие Coral */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Запросы</h1>
        <LeadCreateDialog onCreated={() => setVersion((v) => v + 1)} />
      </div>

      {/* v0.4.0 (§4.2, D25): по-статусные табы — числа из API counts;
          активный — Ink/Medium, подчёркивание Coral (ListTabs). */}
      <ListTabs
        tabs={STATUS_TABS.map((t) => ({
          ...t,
          count: counts ? counts[t.key] : null,
        }))}
        active={statusFilter}
        onChange={(k) => setStatusFilter(k as 'all' | LeadStatus)}
      />

      {/* §4.2: поиск + сортировка (эталонный паттерн списка) */}
      <LeadsToolbar q={q} onQChange={setQ} sort={sort} onSortChange={setSort} />

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
      ) : leads.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground text-sm">
          {q
            ? `Ничего не найдено по «${q}».`
            : statusFilter === 'all'
              ? 'Запросов пока нет — создайте первый.'
              : `Запросов в статусе «${LEAD_STATUS_LABELS[statusFilter]}» нет.`}
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {leads.map((l) => (
            <LeadListCard key={l.id} lead={l} />
          ))}
        </div>
      )}
    </div>
  )
}
