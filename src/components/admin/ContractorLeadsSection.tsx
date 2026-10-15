'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, Plus, Trash2, UserCheck, UserMinus, UserPlus, XCircle } from 'lucide-react'
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
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import { readApiResponse } from '@/lib/api-client'
import { TRANSPORT_TYPES } from '@/lib/leads'
import {
  CONTRACTOR_LEAD_STATUSES,
  CONTRACTOR_LEAD_STATUS_LABELS,
  CONTRACTOR_RAW_INFO_LABELS,
  mergeTransportChips,
  readInfoString,
  readTransportChips,
  type ContractorLeadStatus,
} from '@/lib/contractors'

// ─── Воронка квалификации подрядчиков (Г5, паттерн лидов В5) ───────
// Кандидаты (ContractorLead, Г2) — табы по статусам, диалог создания с
// черновой анкетой rawInfo, диалог кандидата с переходами: в
// квалификацию, отказ с причиной, перевод в пул с формой рождения
// подрядчика (телефон/стартовый пароль/компетенции), удаление без
// родившегося подрядчика. Отдельной карточки-страницы нет: у кандидата
// мало контента (не лид с 28-польной анкетой и вариантами) — диалог
// закрывает сценарий, очередь Г5 называет один маршрут /admin/contractors.

type ContractorLeadRow = {
  id: string
  companyName: string
  status: ContractorLeadStatus
  rejectReason: string | null
  createdAt: string
  rawInfo: Record<string, unknown> | null
  contractor: { id: string; companyName: string; phone: string; isActive: boolean } | null
}

const fmtDate = (iso: string): string => new Date(iso).toLocaleDateString('ru-RU')

// ─── Чипы видов транспорта: общий редактор воронки и пула ─────────
// Значения — TRANSPORT_TYPES из lib/leads.ts (очередь Г5); выбранные
// подсвечены, точка расширения допусков — Phase 2 (роадмап 6).
export function TransportChips({
  selected,
  onToggle,
}: {
  selected: string[]
  onToggle: (v: string) => void
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {TRANSPORT_TYPES.map((t) => {
        const on = selected.includes(t)
        return (
          <button
            key={t}
            type="button"
            onClick={() => onToggle(t)}
            className={
              'rounded-full border px-2.5 py-1 text-xs transition-colors ' +
              (on
                ? 'border-transparent bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:border-ring hover:text-foreground')
            }
          >
            {t}
          </button>
        )
      })}
    </div>
  )
}

// ─── Анкета rawInfo: известные ключи с метками, чужие — как есть ──
function RawInfoView({ rawInfo }: { rawInfo: Record<string, unknown> | null }) {
  if (!rawInfo || Object.keys(rawInfo).length === 0) {
    return <div className="text-sm text-muted-foreground">Анкета не заполнена</div>
  }
  const known = new Set(Object.keys(CONTRACTOR_RAW_INFO_LABELS))
  const entries = Object.entries(rawInfo)
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {entries.map(([k, v]) => {
        if (k === 'transportTypes') {
          const chips = readTransportChips(v)
          return (
            <div key={k} className="grid gap-1">
              <span className="text-xs text-muted-foreground">{CONTRACTOR_RAW_INFO_LABELS[k]}</span>
              {chips.length ? (
                <div className="flex flex-wrap gap-1">
                  {chips.map((t) => (
                    <Badge key={t} variant="outline" className="text-xxs">
                      {t}
                    </Badge>
                  ))}
                </div>
              ) : (
                <span className="text-sm">—</span>
              )}
            </div>
          )
        }
        if (Array.isArray(v)) return null // чужие массивы не рендерим строкой
        const str = typeof v === 'string' && v.trim() ? v : typeof v === 'number' ? String(v) : ''
        return (
          <div key={k} className="grid gap-1">
            <span className="text-xs text-muted-foreground">
              {known.has(k) ? CONTRACTOR_RAW_INFO_LABELS[k] : k}
            </span>
            <span className="text-sm">{str || '—'}</span>
          </div>
        )
      })}
    </div>
  )
}

// ─── Форма перевода в пул (рождение подрядчика, Г2) ────────────────
type ContractForm = {
  phone: string
  password: string
  transports: string[]
  directions: string
  contractNumber: string
  contractSignedAt: string
  comment: string
}

const EMPTY_CONTRACT_FORM: ContractForm = {
  phone: '',
  password: '',
  transports: [],
  directions: '',
  contractNumber: '',
  contractSignedAt: '',
  comment: '',
}

export function ContractorLeadsSection({
  refreshKey = 0,
  onContractorBorn,
}: {
  refreshKey?: number
  onContractorBorn?: () => void
}) {
  const { toast } = useToast()

  const [leads, setLeads] = useState<ContractorLeadRow[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<'all' | ContractorLeadStatus>('all')

  // Диалог создания кандидата
  const [createOpen, setCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({
    companyName: '',
    contactPerson: '',
    phone: '',
    email: '',
    directions: '',
    transports: [] as string[],
  })

  // Диалог кандидата (просмотр анкеты + действия)
  const [selected, setSelected] = useState<ContractorLeadRow | null>(null)

  // Перевод в пул (форма рождения)
  const [contractForm, setContractForm] = useState<ContractForm>({ ...EMPTY_CONTRACT_FORM })
  const [contractOpen, setContractOpen] = useState(false)
  const [contracting, setContracting] = useState(false)

  // Отказ с причиной
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [rejecting, setRejecting] = useState(false)

  // Удаление (без родившегося подрядчика)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(
    async (status: 'all' | ContractorLeadStatus) => {
      setLoading(true)
      try {
        const url =
          status === 'all'
            ? '/api/admin/contractor-leads'
            : `/api/admin/contractor-leads?status=${status}`
        const res = await fetch(url)
        const data = await readApiResponse<{ contractorLeads: ContractorLeadRow[]; error?: string }>(res)
        if (!res.ok) throw new Error(data.error || 'Ошибка загрузки')
        setLeads(data.contractorLeads)
      } catch (e) {
        toast({
          title: 'Не удалось загрузить кандидатов',
          description: e instanceof Error ? e.message : '',
          variant: 'destructive',
        })
      } finally {
        setLoading(false)
      }
    },
    [toast]
  )

  useEffect(() => {
    load(statusFilter)
  }, [statusFilter, load, refreshKey])

  // Актуальный кандидат для диалога (после мутаций перечитываем список,
  // а диалогу нужен свежий статус — берём из перечитанного списка)
  const current = selected ? leads.find((l) => l.id === selected.id) ?? selected : null

  const patchLead = async (lead: ContractorLeadRow, body: Record<string, unknown>) => {
    const res = await fetch(`/api/admin/contractor-leads/${lead.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await readApiResponse<{ contractorLead?: ContractorLeadRow; message?: string; error?: string }>(res)
    if (!res.ok) {
      toast({ title: data.error || 'Ошибка', variant: 'destructive' })
      return false
    }
    toast({ title: data.message || 'Обновлено' })
    await load(statusFilter)
    if (data.contractorLead) setSelected(data.contractorLead)
    return true
  }

  // ── Создание кандидата ─────────────────────────────────────────
  const openCreate = () => {
    setForm({ companyName: '', contactPerson: '', phone: '', email: '', directions: '', transports: [] })
    setCreateOpen(true)
  }

  const handleCreate = async () => {
    if (!form.companyName.trim()) {
      toast({ title: 'Укажите название компании', variant: 'destructive' })
      return
    }
    setCreating(true)
    try {
      // rawInfo — черновик: телефон не нормализуем (логин родится при
      // переводе в пул — там сервер нормализует, Г2), пустые поля не
      // отправляем вовсе.
      const rawInfo: Record<string, unknown> = {}
      if (form.contactPerson.trim()) rawInfo.contactPerson = form.contactPerson.trim()
      if (form.phone.trim()) rawInfo.phone = form.phone.trim()
      if (form.email.trim()) rawInfo.email = form.email.trim()
      if (form.directions.trim()) rawInfo.directions = form.directions.trim()
      if (form.transports.length) rawInfo.transportTypes = form.transports

      const res = await fetch('/api/admin/contractor-leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName: form.companyName.trim(),
          ...(Object.keys(rawInfo).length ? { rawInfo } : {}),
        }),
      })
      const data = await readApiResponse<{ error?: string }>(res)
      if (!res.ok) throw new Error(data.error || 'Не удалось создать кандидата')
      toast({ title: 'Кандидат создан', description: 'Статус: Новый' })
      setCreateOpen(false)
      load(statusFilter)
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

  // ── Перевод в пул: форма ───────────────────────────────────────
  const openContract = (lead: ContractorLeadRow) => {
    const raw = lead.rawInfo ?? {}
    // Предзаполнение из анкеты кандидата: телефон — будущий логин ЛК,
    // чипы — из transportTypes анкеты (чужие значения merge сохранит).
    setContractForm({
      ...EMPTY_CONTRACT_FORM,
      phone: readInfoString(raw.phone),
      transports: readTransportChips(raw.transportTypes).filter((t) =>
        (TRANSPORT_TYPES as readonly string[]).includes(t)
      ),
      directions: readInfoString(raw.directions),
    })
    setContractOpen(true)
  }

  const handleContract = async () => {
    if (!current) return
    const f = contractForm
    if (!f.phone.trim()) {
      toast({ title: 'Укажите телефон — это логин подрядчика в ЛК', variant: 'destructive' })
      return
    }
    if (f.password.length < 6) {
      toast({ title: 'Стартовый пароль — минимум 6 символов', variant: 'destructive' })
      return
    }
    setContracting(true)
    const ok = await patchLead(current, {
      status: 'contracted',
      phone: f.phone.trim(),
      password: f.password,
      competencies: {
        transportModes: mergeTransportChips(current.rawInfo?.transportTypes, f.transports),
        ...(f.directions.trim() ? { directions: f.directions.trim() } : {}),
      },
      ...(f.contractNumber.trim() ? { contractNumber: f.contractNumber.trim() } : {}),
      ...(f.contractSignedAt ? { contractSignedAt: f.contractSignedAt } : {}),
      ...(f.comment.trim() ? { comment: f.comment.trim() } : {}),
    })
    setContracting(false)
    if (ok) {
      setContractOpen(false)
      // Родился подрядчик — пул на этой же странице должен его
      // увидеть без ручного дерганья фильтра (страница даёт сигнал).
      onContractorBorn?.()
    }
  }

  // ── Отказ с причиной ───────────────────────────────────────────
  const handleReject = async () => {
    if (!current) return
    if (!rejectReason.trim()) {
      toast({ title: 'Укажите причину отказа', variant: 'destructive' })
      return
    }
    setRejecting(true)
    const ok = await patchLead(current, { status: 'rejected', rejectReason: rejectReason.trim() })
    setRejecting(false)
    if (ok) setRejectOpen(false)
  }

  // ── Удаление (только без подрядчика — отражение серверного 409) ─
  const handleDelete = async () => {
    if (!current) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/admin/contractor-leads/${current.id}`, { method: 'DELETE' })
      const data = await readApiResponse<{ message?: string; error?: string }>(res)
      if (!res.ok) throw new Error(data.error || 'Не удалось удалить кандидата')
      toast({ title: data.message || 'Кандидат удалён' })
      setDeleteOpen(false)
      setSelected(null)
      load(statusFilter)
    } catch (e) {
      toast({
        title: 'Ошибка',
        description: e instanceof Error ? e.message : '',
        variant: 'destructive',
      })
      setDeleting(false)
    }
  }

  const toggleChip = (v: string, arr: string[], set: (next: string[]) => void) =>
    set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v])

  return (
    <section className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Квалификация</h2>
          <p className="text-sm text-muted-foreground">
            Кандидаты: знакомство → переговоры → пул. Переводы — руками, автоматов нет (роадмап 8.1)
          </p>
        </div>
        <Button variant="outline" onClick={openCreate}>
          <Plus className="size-4" />
          Новый кандидат
        </Button>
      </div>

      {/* Табы по статусам воронки (паттерн лидов В5, ?status= из Г2) */}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={statusFilter === 'all' ? 'default' : 'outline'}
          onClick={() => setStatusFilter('all')}
        >
          Все
        </Button>
        {CONTRACTOR_LEAD_STATUSES.map((s) => (
          <Button
            key={s}
            size="sm"
            variant={statusFilter === s ? 'default' : 'outline'}
            onClick={() => setStatusFilter(s)}
          >
            {CONTRACTOR_LEAD_STATUS_LABELS[s]}
          </Button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm py-6 justify-center">
          <Loader2 className="size-4 animate-spin" />
          Загрузка…
        </div>
      ) : leads.length === 0 ? (
        <Card className="p-6 text-center text-muted-foreground text-sm">
          {statusFilter === 'all'
            ? 'Кандидатов пока нет — добавьте первого.'
            : `Кандидатов со статусом «${CONTRACTOR_LEAD_STATUS_LABELS[statusFilter]}» нет.`}
        </Card>
      ) : (
        <div className="grid gap-2">
          {leads.map((l) => {
            const raw = l.rawInfo ?? {}
            const person = readInfoString(raw.contactPerson)
            const phone = readInfoString(raw.phone)
            const directions = readInfoString(raw.directions)
            return (
              <Card
                key={l.id}
                className="p-4 flex flex-wrap items-center gap-x-6 gap-y-2 cursor-pointer transition-colors hover:border-ring"
                onClick={() => setSelected(l)}
              >
                <div className="min-w-44 flex-1">
                  <div className="font-medium truncate">{l.companyName}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {[person || 'без контактного лица', phone].filter(Boolean).join(' · ')} ·{' '}
                    {fmtDate(l.createdAt)}
                  </div>
                </div>
                <div className="min-w-40 flex-1 text-sm">
                  {directions || <span className="text-muted-foreground">Зоны не указаны</span>}
                </div>
                <ContractorLeadStatusBadge status={l.status} />
              </Card>
            )
          })}
        </div>
      )}

      {/* ── Диалог создания кандидата ─────────────────────────────── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Новый кандидат</DialogTitle>
            <DialogDescription>
              Черновая анкета: кто, что возит, где работает. Подрядчик в справочнике родится
              сам при переводе в пул.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <Label>Компания</Label>
              <Input
                placeholder="Например: ООО Транзит-Лайн"
                value={form.companyName}
                onChange={(e) => setForm((f) => ({ ...f, companyName: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">Контактное лицо</Label>
                <Input
                  placeholder="Имя"
                  value={form.contactPerson}
                  onChange={(e) => setForm((f) => ({ ...f, contactPerson: e.target.value }))}
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">Телефон</Label>
                <Input
                  type="tel"
                  placeholder="Можно с пробелами"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">Email — не обязательно</Label>
                <Input
                  type="email"
                  placeholder="ops@company.ru"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">Зоны работы</Label>
                <Input
                  placeholder="Например: Китай — РФ, СНГ"
                  value={form.directions}
                  onChange={(e) => setForm((f) => ({ ...f, directions: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs text-muted-foreground">Что возит (виды транспорта)</Label>
              <TransportChips
                selected={form.transports}
                onToggle={(v) =>
                  setForm((f) => ({ ...f, transports: f.transports.includes(v) ? f.transports.filter((x) => x !== v) : [...f.transports, v] }))
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleCreate} disabled={creating}>
              {creating && <Loader2 className="size-4 animate-spin" />}
              Добавить кандидата
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Диалог кандидата: анкета + переходы ───────────────────── */}
      <Dialog open={!!current} onOpenChange={(open) => !open && setSelected(null)}>
        {current && (
          <DialogContent className="sm:max-w-xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex flex-wrap items-center gap-2">
                {current.companyName}
                <ContractorLeadStatusBadge status={current.status} />
              </DialogTitle>
              <DialogDescription>
                Кандидат от {fmtDate(current.createdAt)} ·{' '}
                {current.contractor
                  ? `подрядчик в пуле: ${current.contractor.companyName}`
                  : 'переходы — руками менеджера'}
              </DialogDescription>
            </DialogHeader>

            <RawInfoView rawInfo={current.rawInfo} />

            {current.status === 'rejected' && current.rejectReason && (
              <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm">
                <span className="text-muted-foreground">Причина отказа: </span>
                {current.rejectReason}
              </div>
            )}

            {current.contractor && (
              <div className="rounded-md border px-3 py-2 text-sm flex flex-wrap items-center gap-2">
                <span className="text-muted-foreground">Подрядчик:</span>
                <span className="font-medium">{current.contractor.companyName}</span>
                <span className="text-muted-foreground">{current.contractor.phone}</span>
                {current.contractor.isActive ? (
                  <Badge className="bg-success text-success-foreground border-transparent" variant="outline">
                    в пуле
                  </Badge>
                ) : (
                  <Badge className="bg-destructive text-destructive-foreground border-transparent" variant="outline">
                    исключён
                  </Badge>
                )}
              </div>
            )}

            <DialogFooter className="flex-wrap gap-2 sm:flex-wrap">
              {current.status === 'new' && (
                <Button
                  variant="outline"
                  onClick={() => patchLead(current, { status: 'qualifying' })}
                >
                  <UserCheck className="size-4" />
                  В квалификацию
                </Button>
              )}
              {current.status === 'rejected' && (
                <Button
                  variant="outline"
                  onClick={() => patchLead(current, { status: 'qualifying' })}
                >
                  <UserCheck className="size-4" />
                  Вернуть в квалификацию
                </Button>
              )}
              {(current.status === 'new' || current.status === 'qualifying') && (
                <>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setRejectReason('')
                      setRejectOpen(true)
                    }}
                  >
                    <XCircle className="size-4" />
                    Отказ…
                  </Button>
                  <Button onClick={() => openContract(current)}>
                    <UserPlus className="size-4" />
                    Перевести в пул…
                  </Button>
                </>
              )}
              {/* contracted терминален; удаление — только без подрядчика
                  (сервер 409, кнопка — отражение правила, как с
                  обязательными этапами в Б3/Б5) */}
              {!current.contractor && (
                <Button
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  onClick={() => setDeleteOpen(true)}
                >
                  <Trash2 className="size-4" />
                  Удалить
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      {/* ── Форма рождения: перевод в пул ─────────────────────────── */}
      <Dialog open={contractOpen} onOpenChange={setContractOpen}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Перевести в пул — {current?.companyName}</DialogTitle>
            <DialogDescription>
              Рождается подрядчик со входом в урезанный ЛК. Телефон — логин (нормализуется
              сервером), пароль передайте подрядчику.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Телефон (логин ЛК)</Label>
                <Input
                  type="tel"
                  placeholder="+7 900 000-00-00"
                  value={contractForm.phone}
                  onChange={(e) => setContractForm((f) => ({ ...f, phone: e.target.value }))}
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Стартовый пароль</Label>
                <Input
                  type="text"
                  placeholder="Минимум 6 символов"
                  value={contractForm.password}
                  onChange={(e) => setContractForm((f) => ({ ...f, password: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs text-muted-foreground">Компетенции — виды транспорта</Label>
              <TransportChips
                selected={contractForm.transports}
                onToggle={(v) =>
                  toggleChip(v, contractForm.transports, (next) =>
                    setContractForm((f) => ({ ...f, transports: next }))
                  )
                }
              />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs text-muted-foreground">Зоны работы</Label>
              <Input
                placeholder="Например: Китай — РФ, СНГ"
                value={contractForm.directions}
                onChange={(e) => setContractForm((f) => ({ ...f, directions: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">Номер договора — не обязателен</Label>
                <Input
                  placeholder="Например: 0105/1-СВ"
                  value={contractForm.contractNumber}
                  onChange={(e) => setContractForm((f) => ({ ...f, contractNumber: e.target.value }))}
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">Дата договора</Label>
                <Input
                  type="date"
                  value={contractForm.contractSignedAt}
                  onChange={(e) => setContractForm((f) => ({ ...f, contractSignedAt: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs text-muted-foreground">Комментарий — не обязателен</Label>
              <Textarea
                rows={2}
                placeholder="Заметка менеджера о подрядчике"
                value={contractForm.comment}
                onChange={(e) => setContractForm((f) => ({ ...f, comment: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleContract} disabled={contracting}>
              {contracting && <Loader2 className="size-4 animate-spin" />}
              Создать подрядчика и перевести в пул
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Отказ с причиной (обязательна — симметрия lostReason) ── */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Отказ — {current?.companyName}</DialogTitle>
            <DialogDescription>
              Причина обязательна. Кандидат не терминален: вернуть в квалификацию можно
              будет в любой момент.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            rows={3}
            placeholder="Например: нет допусков на опасные грузы"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
          />
          <DialogFooter>
            <Button variant="destructive" onClick={handleReject} disabled={rejecting}>
              {rejecting && <Loader2 className="size-4 animate-spin" />}
              Отклонить кандидата
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Удаление кандидата ───────────────────────────────────── */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Удалить кандидата «{current?.companyName}»?</DialogTitle>
            <DialogDescription>
              Удалить можно только кандидата без родившегося подрядчика. Анкета пропадёт
              безвозвратно.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Отмена
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting && <Loader2 className="size-4 animate-spin" />}
              <UserMinus className="size-4" />
              Удалить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}

export function ContractorLeadStatusBadge({ status }: { status: ContractorLeadStatus }) {
  const map: Record<ContractorLeadStatus, string> = {
    new: 'bg-info text-info-foreground',
    qualifying: 'bg-warning text-warning-foreground',
    contracted: 'bg-success text-success-foreground',
    rejected: 'bg-destructive text-destructive-foreground',
  }
  return (
    <Badge className={`${map[status]} border-transparent`} variant="outline">
      {CONTRACTOR_LEAD_STATUS_LABELS[status]}
    </Badge>
  )
}
