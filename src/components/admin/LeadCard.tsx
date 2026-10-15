'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowRight,
  Loader2,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { readApiResponse } from '@/lib/api-client'
import { LeadStatusBadge } from '@/components/admin/LeadsList'
import { Breadcrumbs } from '@/components/admin/Breadcrumbs'
import { CargoGroups } from '@/components/admin/CargoGroups'
import { ActivityFeed, type ActivityRow } from '@/components/admin/ActivityFeed'
import { NoteForm } from '@/components/admin/NoteForm'
import {
  BrokerLinksSection,
  type BrokerLinkRow,
} from '@/components/admin/BrokerLinksSection'
import {
  QUOTE_PRIORITY_FITS,
  QUOTE_PRIORITY_FIT_LABELS,
  TRANSPORT_TYPES,
  readLeadCargo,
  type LeadStatus,
  type QuotePriorityFit,
} from '@/lib/leads'

// ─── Типы ответов API (В2/В3/В4) ────────────────────────────────

type QuoteOptionRow = {
  id: string
  description: string
  transportModes: string[] | null
  priceEstimate: number
  etaDays: number
  priorityFit: string
  isSelected: boolean
}

type LeadFull = {
  id: string
  status: LeadStatus
  lostReason: string | null
  createdAt: string
  source: string
  rawContact: { name: string; phone?: string; email?: string } | null
  cargoInfo: Record<string, unknown> | null
  customer: { id: string; name: string; phone: string | null; email: string | null } | null
  options: QuoteOptionRow[]
  order: { id: string; number: string; status: string } | null
  // Д: брокеры расчёта с оценками таможенных платежей (оценка — на
  // связи LeadBroker, 1:1)
  brokers: BrokerLinkRow[]
  // Ж2: лента событий — внутри GET карточки и ответов действий
  activities: ActivityRow[]
}

type LegalEntityRow = { id: string; name: string }

const fmtDate = (iso: string): string => new Date(iso).toLocaleDateString('ru-RU')
const fmtMoney = (n: number): string => new Intl.NumberFormat('ru-RU').format(n) + ' ₽'

const INCOTERMS = ['EXW', 'FCA', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP', 'FAS', 'FOB', 'CFR', 'CIF']

type OptionForm = {
  description: string
  priceEstimate: string
  etaDays: string
  priorityFit: string
  modes: string[]
}

const EMPTY_OPTION_FORM: OptionForm = {
  description: '',
  priceEstimate: '',
  etaDays: '',
  priorityFit: 'cost',
  modes: [],
}

export function LeadCard() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { toast } = useToast()

  const [lead, setLead] = useState<LeadFull | null>(null)
  const [loading, setLoading] = useState(true)

  // Вариант расчёта: добавление/правка в одном диалоге
  const [optionOpen, setOptionOpen] = useState(false)
  const [editingOptionId, setEditingOptionId] = useState<string | null>(null)
  const [optionForm, setOptionForm] = useState<OptionForm>({ ...EMPTY_OPTION_FORM })
  const [savingOption, setSavingOption] = useState(false)

  // Конвертация (В4)
  const [convertOpen, setConvertOpen] = useState(false)
  const [converting, setConverting] = useState(false)
  const [legalEntities, setLegalEntities] = useState<LegalEntityRow[]>([])
  const [legalEntityId, setLegalEntityId] = useState('')
  const [incoterm, setIncoterm] = useState('none')
  const [hsCode, setHsCode] = useState('')

  // Проигрыш (В2: lost + обязательная причина)
  const [lostOpen, setLostOpen] = useState(false)
  const [lostReason, setLostReason] = useState('')
  const [losing, setLosing] = useState(false)

  // Удаление (В2: только лид без заявки)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/leads/${id}`)
      if (res.status === 404) {
        toast({ title: 'Лид не найден', variant: 'destructive' })
        router.replace('/admin/leads')
        return
      }
      const data = await readApiResponse<{ lead: LeadFull; error?: string }>(res)
      if (!res.ok) throw new Error(data.error || 'Ошибка загрузки')
      setLead(data.lead)
    } catch (e) {
      toast({
        title: 'Не удалось загрузить лид',
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

  // ── Действия ──────────────────────────────────────────────────

  const patchLead = async (body: Record<string, unknown>) => {
    const res = await fetch(`/api/admin/leads/${id}`, {
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

  const onStatusChange = (v: string) => {
    if (v === 'lost') {
      setLostReason('')
      setLostOpen(true)
      return
    }
    patchLead({ status: v })
  }

  const confirmLost = async () => {
    if (!lostReason.trim()) {
      toast({ title: 'Укажите причину отказа', variant: 'destructive' })
      return
    }
    setLosing(true)
    const ok = await patchLead({ status: 'lost', lostReason: lostReason.trim() })
    setLosing(false)
    if (ok) setLostOpen(false)
  }

  const openAddOption = () => {
    setEditingOptionId(null)
    setOptionForm({ ...EMPTY_OPTION_FORM })
    setOptionOpen(true)
  }

  const openEditOption = (o: QuoteOptionRow) => {
    setEditingOptionId(o.id)
    setOptionForm({
      description: o.description,
      priceEstimate: String(o.priceEstimate),
      etaDays: String(o.etaDays),
      priorityFit: o.priorityFit,
      modes: Array.isArray(o.transportModes)
        ? o.transportModes.filter((m): m is string => typeof m === 'string')
        : [],
    })
    setOptionOpen(true)
  }

  const saveOption = async () => {
    const description = optionForm.description.trim()
    const price = Number(optionForm.priceEstimate.replace(',', '.'))
    const eta = Number(optionForm.etaDays.replace(',', '.'))
    if (!description) {
      toast({ title: 'Опишите вариант расчёта', variant: 'destructive' })
      return
    }
    if (!Number.isInteger(price) || price <= 0) {
      toast({ title: 'Стоимость — целое число рублей, больше нуля', variant: 'destructive' })
      return
    }
    if (!Number.isInteger(eta) || eta <= 0) {
      toast({ title: 'Срок — целое число дней, больше нуля', variant: 'destructive' })
      return
    }
    setSavingOption(true)
    try {
      const body = {
        description,
        priceEstimate: price,
        etaDays: eta,
        priorityFit: optionForm.priorityFit,
        ...(optionForm.modes.length ? { transportModes: optionForm.modes } : {}),
      }
      const res = editingOptionId
        ? await fetch(`/api/admin/options/${editingOptionId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          })
        : await fetch(`/api/admin/leads/${id}/options`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          })
      const data = await readApiResponse<{ message?: string; error?: string }>(res)
      if (!res.ok) throw new Error(data.error || 'Не удалось сохранить вариант')
      toast({ title: data.message || 'Вариант расчёта сохранён' })
      setOptionOpen(false)
      load()
    } catch (e) {
      toast({
        title: 'Ошибка',
        description: e instanceof Error ? e.message : '',
        variant: 'destructive',
      })
    } finally {
      setSavingOption(false)
    }
  }

  const selectOption = async (o: QuoteOptionRow) => {
    const res = await fetch(`/api/admin/options/${o.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isSelected: true }),
    })
    const data = await readApiResponse<{ message?: string; error?: string }>(res)
    if (!res.ok) {
      toast({ title: data.error || 'Ошибка', variant: 'destructive' })
      return
    }
    toast({ title: 'Вариант выбран' })
    load()
  }

  const deleteOption = async (o: QuoteOptionRow) => {
    const res = await fetch(`/api/admin/options/${o.id}`, { method: 'DELETE' })
    const data = await readApiResponse<{ message?: string; error?: string }>(res)
    if (!res.ok) {
      toast({ title: data.error || 'Не удалось удалить вариант', variant: 'destructive' })
      return
    }
    toast({ title: data.message || 'Вариант удалён' })
    load()
  }

  const openConvert = () => {
    // ТН ВЭД предзаполняем из анкеты (бланк п.5), остальное — выбор
    const hs = lead ? readLeadCargo(lead.cargoInfo).hsCode : undefined
    setHsCode(typeof hs === 'string' ? hs : '')
    setLegalEntityId('')
    setIncoterm('none')
    setConvertOpen(true)
  }

  const doConvert = async () => {
    if (!legalEntityId) {
      toast({ title: 'Выберите юрлицо', variant: 'destructive' })
      return
    }
    setConverting(true)
    try {
      const res = await fetch(`/api/admin/leads/${id}/convert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          legalEntityId,
          incoterm: incoterm === 'none' ? null : incoterm,
          hsCode: hsCode.trim() || null,
        }),
      })
      const data = await readApiResponse<{ order: { id: string }; message?: string; error?: string }>(res)
      if (!res.ok) throw new Error(data.error || 'Не удалось конвертировать')
      toast({ title: data.message || 'Заявка создана' })
      setConvertOpen(false)
      // Сразу к свежей заявке: там этапы и статус — следить удобно
      router.push(`/admin/orders/${data.order.id}`)
    } catch (e) {
      toast({
        title: 'Ошибка конвертации',
        description: e instanceof Error ? e.message : '',
        variant: 'destructive',
      })
    } finally {
      setConverting(false)
    }
  }

  const doDelete = async () => {
    setDeleting(true)
    try {
      const res = await fetch(`/api/admin/leads/${id}`, { method: 'DELETE' })
      const data = await readApiResponse<{ message?: string; error?: string }>(res)
      if (!res.ok) throw new Error(data.error || 'Не удалось удалить лид')
      toast({ title: data.message || 'Лид удалён' })
      router.push('/admin/leads')
    } catch (e) {
      toast({
        title: 'Ошибка',
        description: e instanceof Error ? e.message : '',
        variant: 'destructive',
      })
      setDeleting(false)
    }
  }

  // Справочник юрлиц — при первом открытии диалога конвертации
  useEffect(() => {
    if (!convertOpen || legalEntities.length) return
    fetch('/api/admin/legal-entities')
      .then((r) => r.json())
      .then((d) => setLegalEntities(d.legalEntities ?? []))
      .catch(() => {})
  }, [convertOpen, legalEntities.length])

  if (loading || !lead) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground text-sm py-16 justify-center">
        <Loader2 className="size-4 animate-spin" />
        Загрузка…
      </div>
    )
  }

  const isWon = lead.status === 'won'
  const selectedOption = lead.options.find((o) => o.isSelected) ?? null

  // ── Анкета: контакты (бланк-группы груза — общий компонент CargoGroups,
  // Ж1: один бланк — одно место показа для лида и заявки)
  const contactEntries: [string, string | null][] = lead.customer
    ? [
        ['Клиент (справочник)', lead.customer.name],
        ['Телефон', lead.customer.phone || null],
        ['Email', lead.customer.email || null],
      ]
    : lead.rawContact
      ? [
          ['Контакт', lead.rawContact.name],
          ['Телефон', lead.rawContact.phone ?? null],
          ['Email', lead.rawContact.email ?? null],
        ]
      : []

  return (
    <div className="grid gap-4">
      {/* Ж7: крошки вместо кнопки «назад» — путь виден целиком
          (Главная / Лиды / текущий лид), паттерн карточки заявки. */}
      <Breadcrumbs
        items={[
          { label: 'Главная', href: '/admin' },
          { label: 'Лиды', href: '/admin/leads' },
          { label: `Лид от ${fmtDate(lead.createdAt)}` },
        ]}
      />
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Лид от {fmtDate(lead.createdAt)}</h1>
        <LeadStatusBadge status={lead.status} />
        {/* И1: запрос из клиентского кабинета */}
        {lead.source === 'cabinet' && <Badge variant="outline">Кабинет</Badge>}
        <div className="ml-auto flex items-center gap-2">
          {!isWon && (
            <Select value={lead.status} onValueChange={onStatusChange}>
              <SelectTrigger size="sm" className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {/* won в ручной смене недоступен (В2: только конвертацией) */}
                {(['new', 'calculated', 'lost'] as const).map((s) => (
                  <SelectItem key={s} value={s}>
                    {s === 'new' ? 'Новый' : s === 'calculated' ? 'Рассчитан' : 'Отказ'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {!lead.order && (
            <Button
              variant="ghost"
              size="icon"
              className="size-8 text-destructive hover:text-destructive"
              onClick={() => setDeleteOpen(true)}
              title="Удалить лид"
            >
              <Trash2 className="size-4" />
            </Button>
          )}
        </div>
      </div>

      {lead.status === 'lost' && lead.lostReason && (
        <Card className="p-3 text-sm border-destructive/40 bg-destructive/5">
          <span className="text-muted-foreground">Причина отказа: </span>
          {lead.lostReason}
        </Card>
      )}

      {/* ── Анкета (бланк заявки, read-only: правки — пересозданием,
             решение зафиксировано в В2) ─────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Анкета запроса</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            {contactEntries.map(
              ([label, value]) =>
                value && <Info key={label} label={label} value={value} />
            )}
            {contactEntries.every(([, v]) => !v) && (
              <span className="text-muted-foreground text-sm">Контакты не указаны</span>
            )}
          </div>
          {/* Пустая анкета / чужие ключи / группы бланка — решает сам
              CargoGroups (единый показ для лида и заявки, Ж1) */}
          <CargoGroups
            cargoInfo={lead.cargoInfo}
            emptyText="Анкета груза не заполнена (запрос зарегистрирован без подробностей)"
          />
        </CardContent>
      </Card>

      {/* ── Д: брокеры расчёта (роадмап 5а) — подключаются на расчёте,
          оценка платежей — их обязанность; при конвертации доступ
          переезжает в заявку. won — история, управление закрыто. */}
      <BrokerLinksSection
        targetType="lead"
        targetId={String(id)}
        links={lead.brokers}
        disabled={isWon}
        onChanged={load}
        emptyText="Брокеры не подключены — подключите таможенного представителя для оценки платежей"
      />

      {/* ── Варианты расчёта (В3) ──────────────────────────────── */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Варианты расчёта</h2>
        {!isWon && (
          <Button size="sm" variant="outline" onClick={openAddOption}>
            <Plus className="size-4" />
            Добавить вариант
          </Button>
        )}
      </div>

      {lead.options.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground text-sm">
          Вариантов пока нет. Первый добавленный вариант переведёт лид в «Рассчитан».
        </Card>
      ) : (
        <div className="grid gap-2">
          {lead.options.map((o) => {
            const modes = Array.isArray(o.transportModes)
              ? o.transportModes.filter((m): m is string => typeof m === 'string')
              : []
            return (
              <Card
                key={o.id}
                className={
                  o.isSelected ? 'p-4 border-primary border-2' : 'p-4 border-l-4 border-l-transparent'
                }
              >
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <div className="min-w-52 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{o.description}</span>
                      {o.isSelected && (
                        <Badge className="bg-primary text-primary-foreground border-transparent">
                          Выбран
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-2 mt-1">
                      {modes.length > 0 && (
                        <span className="flex gap-1">
                          {modes.map((m) => (
                            <Badge key={m} variant="outline" className="text-xxs">
                              {m}
                            </Badge>
                          ))}
                        </span>
                      )}
                      <span>срок: {o.etaDays} дн.</span>
                      <span>· ориентир: {QUOTE_PRIORITY_FIT_LABELS[o.priorityFit as QuotePriorityFit] ?? o.priorityFit}</span>
                    </div>
                  </div>
                  <div className="font-semibold tabular-nums whitespace-nowrap">
                    {fmtMoney(o.priceEstimate)}
                  </div>
                  {!isWon && (
                    <div className="flex items-center gap-1">
                      {!o.isSelected && (
                        <Button variant="outline" size="sm" onClick={() => selectOption(o)}>
                          Выбрать
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        onClick={() => openEditOption(o)}
                        title="Править вариант"
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 text-destructive hover:text-destructive"
                        onClick={() => deleteOption(o)}
                        title="Удалить вариант"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  )}
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {/* ── Конвертация / заявка (В4) ──────────────────────────── */}
      {lead.order ? (
        <Card className="p-4 flex flex-wrap items-center gap-4 border-success/50 bg-success/5">
          <div className="flex-1">
            <div className="font-medium">Конвертирован в заявку</div>
            <div className="text-sm text-muted-foreground">
              Воронка завершена — история лида зафиксирована
            </div>
          </div>
          <Button asChild>
            <Link href={`/admin/orders/${lead.order.id}`}>
              Заявка {lead.order.number}
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </Card>
      ) : lead.status !== 'lost' ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={openConvert} disabled={!selectedOption}>
            Конвертировать в заявку
          </Button>
          {!selectedOption && (
            <span className="text-sm text-muted-foreground">
              Выберите вариант расчёта — на нём построятся условия заявки
            </span>
          )}
        </div>
      ) : null}

      {/* ── Ж3: внутренняя заметка — пишется в ленту, видна только
          сотрудникам (подрядчику/клиенту isInternal не отдаётся) ── */}
      <NoteForm targetType="lead" targetId={String(id)} onAdded={load} />

      {/* ── Ж2: лента событий — хроника лида (создание, варианты,
          статусы, конвертация) ─────────────────────────────── */}
      <ActivityFeed
        activities={lead.activities}
        emptyText="Событий пока нет — журнал начнётся с первого действия"
      />

      {/* ── Диалог: вариант расчёта (добавление/правка) ────────── */}
      <Dialog open={optionOpen} onOpenChange={setOptionOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingOptionId ? 'Править вариант расчёта' : 'Вариант расчёта'}</DialogTitle>
            <DialogDescription>
              Один способ доставки: маршрут/условия, транспорт, стоимость и срок.
              Выбрать можно будет после сохранения.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="opt-desc">Описание</Label>
              <Textarea
                id="opt-desc"
                rows={2}
                placeholder="Например: Авиа Пекин → Шереметьево, прямой рейс"
                value={optionForm.description}
                onChange={(e) => setOptionForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <Label>Виды транспорта</Label>
              <div className="flex flex-wrap gap-2">
                {TRANSPORT_TYPES.map((t) => {
                  const active = optionForm.modes.includes(t)
                  return (
                    <Button
                      key={t}
                      type="button"
                      size="sm"
                      variant={active ? 'default' : 'outline'}
                      onClick={() =>
                        setOptionForm((f) => ({
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
                <Label htmlFor="opt-price">Цена, ₽</Label>
                <Input
                  id="opt-price"
                  inputMode="numeric"
                  placeholder="150000"
                  value={optionForm.priceEstimate}
                  onChange={(e) =>
                    setOptionForm((f) => ({ ...f, priceEstimate: e.target.value }))
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="opt-eta">Срок, дней</Label>
                <Input
                  id="opt-eta"
                  inputMode="numeric"
                  placeholder="12"
                  value={optionForm.etaDays}
                  onChange={(e) => setOptionForm((f) => ({ ...f, etaDays: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label>Ориентир</Label>
                <Select
                  value={optionForm.priorityFit}
                  onValueChange={(v) => setOptionForm((f) => ({ ...f, priorityFit: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {QUOTE_PRIORITY_FITS.map((f) => (
                      <SelectItem key={f} value={f}>
                        {QUOTE_PRIORITY_FIT_LABELS[f]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={saveOption} disabled={savingOption}>
              {savingOption && <Loader2 className="size-4 animate-spin" />}
              {editingOptionId ? 'Сохранить' : 'Добавить'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Диалог: конвертация в заявку (В4) ──────────────────── */}
      <Dialog open={convertOpen} onOpenChange={setConvertOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Конвертировать в заявку</DialogTitle>
            <DialogDescription>
              Клиент найдётся или родится из контактов лида, договор пары
              клиент+юрлицо и заявка с обязательными этапами создадутся
              автоматически. Повторная конвертация невозможна.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
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
                    {INCOTERMS.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="cv-hs">Код ТН ВЭД</Label>
                <Input
                  id="cv-hs"
                  placeholder="Необязательно"
                  value={hsCode}
                  onChange={(e) => setHsCode(e.target.value)}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={doConvert} disabled={converting}>
              {converting && <Loader2 className="size-4 animate-spin" />}
              Создать заявку
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Диалог: проигрыш с причиной (В2) ───────────────────── */}
      <Dialog open={lostOpen} onOpenChange={setLostOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Отказ по лиду</DialogTitle>
            <DialogDescription>
              Причина обязательна — она останется в истории воронки (уход
              из отказа её очистит).
            </DialogDescription>
          </DialogHeader>
          <Textarea
            rows={3}
            placeholder="Например: дорого, клиент выбрал другого экспедитора"
            value={lostReason}
            onChange={(e) => setLostReason(e.target.value)}
          />
          <DialogFooter>
            <Button variant="destructive" onClick={confirmLost} disabled={losing}>
              {losing && <Loader2 className="size-4 animate-spin" />}
              Отметить отказом
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Диалог: удаление лида (В2: только без заявки) ───────── */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Удалить лид?</DialogTitle>
            <DialogDescription>
              Лид будет удалён вместе с его вариантами расчёта
              {lead.options.length > 0 ? ` (${lead.options.length} шт.)` : ''}. Действие
              необратимо; лид с заявкой удалить нельзя.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Отмена
            </Button>
            <Button variant="destructive" onClick={doDelete} disabled={deleting}>
              {deleting && <Loader2 className="size-4 animate-spin" />}
              Удалить
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
      <span className="font-medium break-words">{value}</span>
    </div>
  )
}
