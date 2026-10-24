'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowRight,
  Loader2,
  Pencil,
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
import { AssigneeField } from '@/components/admin/AssigneeField'
import { LeadEditDialog } from '@/components/admin/LeadEditDialog'
import { QuoteOptionsSection } from '@/components/admin/QuoteOptionsSection'
import type { QuoteOptionRow } from '@/components/admin/QuoteOptionsSection'
import { CargoGroups } from '@/components/admin/CargoGroups'
import { ActivityFeed, type ActivityRow } from '@/components/admin/ActivityFeed'
import { DocumentsSection } from '@/components/documents/DocumentsSection'
import { NoteForm } from '@/components/admin/NoteForm'
import {
  BrokerLinksSection,
  type BrokerLinkRow,
} from '@/components/admin/BrokerLinksSection'
import {
  readLeadCargo,
  type LeadStatus,
} from '@/lib/leads'

// ─── Типы ответов API (В2/В3/В4) ────────────────────────────────

type LeadFull = {
  id: string
  status: LeadStatus
  lostReason: string | null
  createdAt: string
  source: string
  rawContact: { name: string; phone?: string; email?: string } | null
  cargoInfo: Record<string, unknown> | null
  customer: { id: string; name: string; phone: string | null; email: string | null } | null
  // P1-03: маршрут/метрики — колонки
  originCity?: string | null
  originCountry?: string | null
  destinationCity?: string | null
  destinationCountry?: string | null
  transportType?: string | null
  readyDate?: string | null
  weightKg?: string | number | null
  volumeM3?: string | number | null
  placesCount?: number | null
  // P1-01: ответственный менеджер (null = не назначен — кабинетный запрос)
  assignee: { id: string; name: string } | null
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

const INCOTERMS = ['EXW', 'FCA', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP', 'FAS', 'FOB', 'CFR', 'CIF']

export function LeadCard() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { toast } = useToast()

  const [lead, setLead] = useState<LeadFull | null>(null)
  const [loading, setLoading] = useState(true)

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

  // P1-02: правка анкеты (контакты + груз) — окно new/calculated
  const [editOpen, setEditOpen] = useState(false)

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
  // P1-02: правка анкеты — new/calculated (won/lost закрывают правку;
  // у lost возврат в работу — мастер, у won правка через заявку)
  const anketaEditable = lead.status === 'new' || lead.status === 'calculated'

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

      {/* P1-01: ответственный менеджер — смена PATCH'ем с записью в журнал
          (у мастера — выбор из справочника, у менеджера — read-only) */}
      <AssigneeField
        value={lead.assignee?.id ?? null}
        currentName={lead.assignee?.name ?? null}
        onSave={(employeeId) => patchLead({ assignedToId: employeeId })}
      />

      {lead.status === 'lost' && lead.lostReason && (
        <Card className="p-3 text-sm border-destructive/40 bg-destructive/5">
          <span className="text-muted-foreground">Причина отказа: </span>
          {lead.lostReason}
        </Card>
      )}

      {/* ── Анкета запроса (бланк заявки; правка — P1-02,
             диффы изменений в журнал пишет сервер) ─────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-base">Анкета запроса</CardTitle>
            {anketaEditable && (
              <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
                <Pencil className="size-4" />
                Править анкету
              </Button>
            )}
          </div>
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
            route={lead}
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

      {/* ── Е: документы сделки (роадмап 5) — предварительный инвойс
          для расчёта пошлины живёт на расчёте. won — без секции: сделка
          переехала в заявку, документы уехали вместе с ней (В4). ── */}
      {!isWon && (
        <DocumentsSection
          documentsUrl={`/api/admin/leads/${id}/documents`}
          versionsUrlFor={(docId) => `/api/admin/documents/${docId}/versions`}
          deleteUrlFor={(docId) => `/api/admin/documents/${docId}`}
          canMarkInternal
          emptyText="Документов нет — предварительный инвойс брокеру, сканы и прочее загружайте здесь"
        />
      )}

      {/* ── Варианты расчёта (В3) — секция вынесена в компонент
          (P1-04: деньги — валюта/НДС/себестоимость) ────────────── */}
      <QuoteOptionsSection
        leadId={String(id)}
        options={lead.options}
        disabled={isWon}
        onChanged={load}
      />
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

      {/* ── P1-02: диалог правки анкеты (контакты + груз) ── */}
      <LeadEditDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        leadId={lead.id}
        hasCustomer={!!lead.customer}
        initialContact={lead.customer ? null : lead.rawContact}
        initialRow={lead}
        onSaved={load}
      />

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
