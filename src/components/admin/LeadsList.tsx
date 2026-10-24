'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Loader2, Plus, Users } from 'lucide-react'
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
import { readApiResponse } from '@/lib/api-client'
import { CargoFormFields } from '@/components/admin/CargoGroups'
import {
  LEAD_STATUSES,
  LEAD_STATUS_LABELS,
  EMPTY_LEAD_CARGO_FORM,
  buildLeadCargo,
  readLeadCargo,
  type LeadStatus,
  type LeadCargoForm,
} from '@/lib/leads'

// ─── Типы ответов API (узкая выжимка, всё как в роутах В2/В3) ──

type QuoteOptionRow = {
  id: string
  description: string
  transportModes: string[] | null
  priceEstimate: number
  etaDays: number
  priorityFit: string
  isSelected: boolean
}

type LeadRow = {
  id: string
  status: LeadStatus
  createdAt: string
  source: string
  rawContact: { name: string; phone?: string; email?: string } | null
  cargoInfo: Record<string, unknown> | null
  customer: { id: string; name: string; phone: string | null } | null
  // P1-01: ответственный менеджер (null = не назначен)
  assignee: { id: string; name: string } | null
  options: QuoteOptionRow[]
  order: { id: string; number: string } | null
}

type CustomerRow = { id: string; name: string; phone: string | null }

const fmtDate = (iso: string): string => new Date(iso).toLocaleDateString('ru-RU')
const fmtMoney = (n: number): string => new Intl.NumberFormat('ru-RU').format(n) + ' ₽'

// Что показывать в строке списка: контакты лида — это клиент из
// справочника (customerId) либо сырые rawContact (В1: до конвертации
// клиента может ещё не быть).
function contactOf(lead: LeadRow): { name: string; phone: string } {
  if (lead.customer) {
    return { name: lead.customer.name, phone: lead.customer.phone ?? '' }
  }
  return { name: lead.rawContact?.name ?? 'Без контактов', phone: lead.rawContact?.phone ?? '' }
}

export function LeadsList() {
  const { toast } = useToast()

  const [leads, setLeads] = useState<LeadRow[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<'all' | LeadStatus>('all')
  // P1-01: фильтр ответственного и сортировка «давно без движения»
  const [assignedFilter, setAssignedFilter] = useState<'all' | 'mine' | 'unassigned'>('all')
  const [sort, setSort] = useState<'newest' | 'stale'>('newest')

  const [customers, setCustomers] = useState<CustomerRow[]>([])
  const [createOpen, setCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)

  // Клиентская часть: либо существующий (customerId), либо сырые
  // контакты rawContact (В1/В2: лид рождается до заведения клиента).
  const [isNewContact, setIsNewContact] = useState(true)
  const [customerId, setCustomerId] = useState('')
  const [contactName, setContactName] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  // Анкета груза — поля типового бланка заявки (В5).
  const [cargo, setCargo] = useState<LeadCargoForm>({ ...EMPTY_LEAD_CARGO_FORM })

  const loadLeads = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (statusFilter !== 'all') params.set('status', statusFilter)
      if (assignedFilter !== 'all') params.set('assigned', assignedFilter)
      if (sort !== 'newest') params.set('sort', sort)
      const res = await fetch(`/api/admin/leads?${params.toString()}`)
      const data = await readApiResponse<{ leads: LeadRow[]; error?: string }>(res)
      if (!res.ok) throw new Error(data.error || 'Ошибка загрузки')
      setLeads(data.leads)
    } catch (e) {
      toast({
        title: 'Не удалось загрузить лиды',
        description: e instanceof Error ? e.message : '',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }, [statusFilter, assignedFilter, sort, toast])

  useEffect(() => {
    loadLeads()
  }, [loadLeads])

  // Справочник клиентов — один раз при первом открытии диалога
  useEffect(() => {
    if (!createOpen || customers.length) return
    fetch('/api/admin/customers')
      .then((r) => r.json())
      .then((d) => setCustomers(d.customers ?? []))
      .catch(() => {})
  }, [createOpen, customers.length])

  const resetForm = () => {
    setCustomerId('')
    setContactName('')
    setContactPhone('')
    setContactEmail('')
    setIsNewContact(true)
    setCargo({ ...EMPTY_LEAD_CARGO_FORM })
  }

  const handleCreate = async () => {
    if (isNewContact && !contactName.trim()) {
      toast({ title: 'Укажите имя контакта', variant: 'destructive' })
      return
    }
    if (!isNewContact && !customerId) {
      toast({ title: 'Выберите клиента из справочника', variant: 'destructive' })
      return
    }
    setCreating(true)
    try {
      // rawContact — черновик: телефон не нормализуем (бывают
      // иностранные +86…, В1), пустые email не отправляем вовсе
      // (серверная zod-схема проверит формат непустого).
      const raw = isNewContact
        ? {
            name: contactName.trim(),
            ...(contactPhone.trim() ? { phone: contactPhone.trim() } : {}),
            ...(contactEmail.trim() ? { email: contactEmail.trim() } : {}),
          }
        : undefined
      const cargoInfo = buildLeadCargo(cargo)

      const res = await fetch('/api/admin/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(isNewContact ? { rawContact: raw } : { customerId }),
          ...(cargoInfo ? { cargoInfo } : {}),
        }),
      })
      const data = await readApiResponse<{ error?: string }>(res)
      if (!res.ok) throw new Error(data.error || 'Не удалось создать лид')

      toast({ title: 'Лид создан', description: 'Статус: Новый' })
      setCreateOpen(false)
      resetForm()
      loadLeads()
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

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Лиды</h1>
          <p className="text-sm text-muted-foreground">
            Воронка запросов: анкета по бланку → варианты расчёта → заявка (Дорожка В)
          </p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="size-4" />
              Новый лид
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Новый лид</DialogTitle>
              <DialogDescription>
                Анкета — по типовой заявке клиента: заполняйте по мере наличия
                данных, все поля груза необязательны. Клиент в справочнике
                родится сам при конвертации в заявку.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-5">
              {/* ── Клиент / контакты ─────────────────────────── */}
              <div className="grid gap-2">
                <Label>Клиент</Label>
                {isNewContact ? (
                  <div className="grid gap-2">
                    <div className="flex gap-2">
                      <Input
                        placeholder="Контактное лицо или компания"
                        value={contactName}
                        onChange={(e) => setContactName(e.target.value)}
                      />
                      <Button type="button" variant="outline" onClick={() => setIsNewContact(false)}>
                        Из списка
                      </Button>
                    </div>
                    <Input
                      type="tel"
                      placeholder="Телефон — не обязателен (можно иностранный)"
                      value={contactPhone}
                      onChange={(e) => setContactPhone(e.target.value)}
                    />
                    <Input
                      type="email"
                      placeholder="Email — не обязателен"
                      value={contactEmail}
                      onChange={(e) => setContactEmail(e.target.value)}
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
                        setIsNewContact(true)
                        setCustomerId('')
                      }}
                    >
                      <Users className="size-4" />
                      Новый
                    </Button>
                  </div>
                )}
              </div>

              {/* ── Анкета груза: общий бланк (CargoFormFields, Ж1 —
                  та же форма правки груза у заявки) ───────────── */}
              <CargoFormFields form={cargo} onChange={setCargo} />
            </div>
            <DialogFooter>
              <Button onClick={handleCreate} disabled={creating}>
                {creating && <Loader2 className="size-4 animate-spin" />}
                Создать лид
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Табы по статусам воронки (роадмап 8.1 + В2: ?status=) */}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={statusFilter === 'all' ? 'default' : 'outline'}
          onClick={() => setStatusFilter('all')}
        >
          Все
        </Button>
        {LEAD_STATUSES.map((s) => (
          <Button
            key={s}
            size="sm"
            variant={statusFilter === s ? 'default' : 'outline'}
            onClick={() => setStatusFilter(s)}
          >
            {LEAD_STATUS_LABELS[s]}
          </Button>
        ))}
      </div>

      {/* P1-01: фильтр ответственного + сортировка «давно без движения» */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">Ответственный:</span>
        <Button
          size="sm"
          variant={assignedFilter === 'all' ? 'default' : 'outline'}
          onClick={() => setAssignedFilter('all')}
        >
          Все
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
        <Select value={sort} onValueChange={(v) => setSort(v as 'newest' | 'stale')}>
          <SelectTrigger className="w-56 ml-auto">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Сначала новые</SelectItem>
            <SelectItem value="stale">Давно без движения</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm py-8 justify-center">
          <Loader2 className="size-4 animate-spin" />
          Загрузка…
        </div>
      ) : leads.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground text-sm">
          {statusFilter === 'all'
            ? 'Лидов пока нет — создайте первый запрос.'
            : `Лидов со статусом «${LEAD_STATUS_LABELS[statusFilter]}» нет.`}
        </Card>
      ) : (
        <div className="grid gap-2">
          {leads.map((l) => {
            const contact = contactOf(l)
            const c = readLeadCargo(l.cargoInfo)
            const cargoName = typeof c.cargoName === 'string' && c.cargoName ? c.cargoName : ''
            const from = typeof c.from === 'string' && c.from ? c.from : ''
            const to = typeof c.to === 'string' && c.to ? c.to : ''
            const selected = l.options.find((o) => o.isSelected)
            return (
              <Link key={l.id} href={`/admin/leads/${l.id}`} className="block group">
                <Card className="p-4 flex flex-wrap items-center gap-x-6 gap-y-2 transition-colors group-hover:border-ring">
                  <div className="min-w-44 flex-1">
                    <div className="font-medium truncate">{contact.name}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {contact.phone || 'без телефона'} · {fmtDate(l.createdAt)}
                    </div>
                  </div>
                  <div className="min-w-52 flex-1">
                    <div className="text-sm truncate">{cargoName || <span className="text-muted-foreground">Груз не указан</span>}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {from || to ? `${from || '—'} → ${to || '—'}` : 'Маршрут не указан'}
                    </div>
                  </div>
                  <div className="text-sm text-muted-foreground tabular-nums whitespace-nowrap">
                    {l.options.length > 0 ? (
                      <>
                        {l.options.length} вар.
                        {selected && <span className="text-foreground font-medium"> · {fmtMoney(selected.priceEstimate)}</span>}
                      </>
                    ) : (
                      'без расчёта'
                    )}
                  </div>
                  {/* P1-01: колонка ответственного в списке */}
                  <div className="min-w-28">
                    <div className="text-xs text-muted-foreground">Ответственный</div>
                    <div className="text-sm truncate">
                      {l.assignee?.name ?? <span className="text-muted-foreground">—</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <LeadStatusBadge status={l.status} />
                    {/* И1: запрос пришёл из клиентского кабинета — менеджеру
                        видно происхождение до открытия карточки */}
                    {l.source === 'cabinet' && <Badge variant="outline">Кабинет</Badge>}
                  </div>
                </Card>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function LeadStatusBadge({ status }: { status: LeadStatus }) {
  const map: Record<LeadStatus, string> = {
    new: 'bg-info text-info-foreground',
    calculated: 'bg-warning text-warning-foreground',
    won: 'bg-success text-success-foreground',
    lost: 'bg-destructive text-destructive-foreground',
  }
  return (
    <Badge className={`${map[status]} border-transparent`} variant="outline">
      {LEAD_STATUS_LABELS[status]}
    </Badge>
  )
}
