'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Building2, Loader2, Pencil, Search, ShieldOff, ShieldCheck, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
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
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { REQUISITE_FIELDS, requisitesInn } from '@/lib/requisite-fields'

// ─── Юрлица (Ж6б) — паттерн списка Ж4/Ж6а ─────────────────────
// Справочник наших компаний: название + реквизиты для печатных форм
// (свободная Json-структура — роадмап «не фиксировать до реальных
// форм», поэтому поля формы описаны отдельно и сохраняются только
// заполненные). Поиск — по названию и реквизитам (ИНН и др.),
// счётчики — договоры и заявки. Правка и создание — в диалогах,
// отдельной страницы-карточки нет: справочник плоский.
//
// Деактивация: неактивное скрывается из выбора при создании заявки,
// но остаётся в старых договорах и заявках — историю не переписываем.

const PAGE_TAKE = 20

type LegalEntityRow = {
  id: string
  name: string
  requisites: unknown
  isActive: boolean
  createdAt: string
  ordersCount: number
  contractsCount: number
}

type LegalEntitiesPage = {
  legalEntities: LegalEntityRow[]
  hasMore: boolean
  counts: { all: number }
}

// Состояние формы реквизитов: Map «ключ → значение» по полям формы;
// пустые строки при отправке отбрасываются (Json не хранит пустышек).
type RequisitesFormState = Record<string, string>

function requisitesToForm(requisites: unknown): RequisitesFormState {
  const form: RequisitesFormState = {}
  if (requisites && typeof requisites === 'object' && !Array.isArray(requisites)) {
    for (const [key, value] of Object.entries(requisites as Record<string, unknown>)) {
      if (typeof value === 'string' || typeof value === 'number') form[key] = String(value)
    }
  }
  return form
}

function formToRequisites(form: RequisitesFormState): Record<string, string> {
  const out: Record<string, string> = {}
  for (const field of REQUISITE_FIELDS) {
    const value = (form[field.key] ?? '').trim()
    if (value) out[field.key] = value
  }
  return out
}

export function LegalEntitiesList() {
  const { toast } = useToast()

  const [rows, setRows] = useState<LegalEntityRow[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [total, setTotal] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [sort, setSort] = useState('name_asc')
  const [q, setQ] = useState('')
  const debouncedQ = useDebouncedValue(q, 400)
  const [version, setVersion] = useState(0)
  const reqId = useRef(0)

  // ── Диалог создания
  const [createOpen, setCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createName, setCreateName] = useState('')
  const [createRequisites, setCreateRequisites] = useState<RequisitesFormState>({})

  // ── Диалог правки
  const [editRow, setEditRow] = useState<LegalEntityRow | null>(null)
  const [saving, setSaving] = useState(false)
  const [togglingActive, setTogglingActive] = useState(false)
  const [editName, setEditName] = useState('')
  const [editRequisites, setEditRequisites] = useState<RequisitesFormState>({})

  // take шлём ВСЕГДА: без параметров роут отдаёт легаси-справочник
  // для Select'а создания заявки (только активные) — как в Ж6а.
  const fetchPage = useCallback(
    async (skip: number): Promise<LegalEntitiesPage> => {
      const params = new URLSearchParams()
      params.set('take', String(PAGE_TAKE))
      if (debouncedQ) params.set('q', debouncedQ)
      if (sort !== 'name_asc') params.set('sort', sort)
      if (skip) params.set('skip', String(skip))
      const res = await fetch(`/api/admin/legal-entities?${params.toString()}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Ошибка загрузки')
      return data
    },
    [debouncedQ, sort]
  )

  useEffect(() => {
    const id = ++reqId.current
    setLoading(true)
    fetchPage(0)
      .then((data) => {
        if (id !== reqId.current) return
        setRows(data.legalEntities)
        setHasMore(data.hasMore)
        setTotal(data.counts.all)
      })
      .catch((e) => {
        if (id !== reqId.current) return
        toast({
          title: 'Не удалось загрузить юрлица',
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
      const data = await fetchPage(rows.length)
      setRows((prev) => [...prev, ...data.legalEntities])
      setHasMore(data.hasMore)
    } catch (e) {
      toast({
        title: 'Не удалось загрузить юрлица',
        description: e instanceof Error ? e.message : '',
        variant: 'destructive',
      })
    } finally {
      setLoadingMore(false)
    }
  }

  // ── Создание ──────────────────────────────────────────────────
  const handleCreate = async () => {
    if (!createName.trim()) {
      toast({ title: 'Укажите название юрлица', variant: 'destructive' })
      return
    }
    setCreating(true)
    try {
      const res = await fetch('/api/admin/legal-entities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: createName.trim(),
          requisites: formToRequisites(createRequisites),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Не удалось создать юрлицо')

      toast({ title: `Юрлицо «${data.legalEntity.name}» создано` })
      setCreateOpen(false)
      setCreateName('')
      setCreateRequisites({})
      setVersion((v) => v + 1)
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

  // ── Правка (имя + реквизиты полной заменой) ───────────────────
  const openEdit = (row: LegalEntityRow) => {
    setEditRow(row)
    setEditName(row.name)
    setEditRequisites(requisitesToForm(row.requisites))
  }

  const handleSave = async () => {
    if (!editRow) return
    if (!editName.trim()) {
      toast({ title: 'Укажите название юрлица', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/legal-entities/${editRow.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName.trim(),
          requisites: formToRequisites(editRequisites),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Не удалось сохранить юрлицо')

      toast({ title: `Юрлицо «${data.legalEntity.name}» сохранено` })
      setEditRow(null)
      setVersion((v) => v + 1)
    } catch (e) {
      toast({
        title: 'Ошибка сохранения',
        description: e instanceof Error ? e.message : '',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  // ── Деактивация / возврат ─────────────────────────────────────
  const handleToggleActive = async () => {
    if (!editRow) return
    const wasActive = editRow.isActive
    setTogglingActive(true)
    try {
      const res = await fetch(`/api/admin/legal-entities/${editRow.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !wasActive }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Не удалось изменить статус')

      toast({
        title: wasActive
          ? `Юрлицо «${data.legalEntity.name}» деактивировано`
          : `Юрлицо «${data.legalEntity.name}» снова активно`,
        description: wasActive
          ? 'Скрыто из выбора при создании заявки; в старых договорах и заявках осталось.'
          : undefined,
      })
      setEditRow(null)
      setVersion((v) => v + 1)
    } catch (e) {
      toast({
        title: 'Ошибка изменения статуса',
        description: e instanceof Error ? e.message : '',
        variant: 'destructive',
      })
    } finally {
      setTogglingActive(false)
    }
  }

  // ── Общая форма полей реквизитов (диалоги создания и правки) ──
  const renderRequisitesFields = (
    form: RequisitesFormState,
    setForm: (updater: (prev: RequisitesFormState) => RequisitesFormState) => void,
    idPrefix: string
  ) => (
    <>
      {REQUISITE_FIELDS.map((field) => (
        <div key={field.key} className="grid gap-2">
          <Label htmlFor={`${idPrefix}-${field.key}`}>{field.label}</Label>
          <Input
            id={`${idPrefix}-${field.key}`}
            inputMode={field.numeric ? 'numeric' : 'text'}
            placeholder={`${field.placeholder} — не обязателен`}
            value={form[field.key] ?? ''}
            onChange={(e) => setForm((prev) => ({ ...prev, [field.key]: e.target.value }))}
          />
        </div>
      ))}
    </>
  )

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Юрлица</h1>
          <p className="text-sm text-muted-foreground">
            Наши компании и их реквизиты для печатных форм
            {total !== null ? ` · всего: ${total}` : ''}
          </p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Building2 className="size-4" />
              Новое юрлицо
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md sm:max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Новое юрлицо</DialogTitle>
              <DialogDescription>
                Заполните реквизиты, которые нужны в документах. Структура свободная:
                лишние поля можно оставить пустыми — в базу уйдут только заполненные.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="le-name">Название</Label>
                <Input
                  id="le-name"
                  placeholder="ООО «Логикс»"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                />
              </div>
              {renderRequisitesFields(createRequisites, setCreateRequisites, 'le-create')}
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

      {/* Паттерн Ж4: поиск с крестиком + сортировка */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pr-8 pl-8"
            placeholder="Название, ИНН, адрес, банк…"
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
            <SelectItem value="name_asc">Название А-Я</SelectItem>
            <SelectItem value="name_desc">Название Я-А</SelectItem>
            <SelectItem value="newest">Сначала новые</SelectItem>
            <SelectItem value="oldest">Сначала старые</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm py-8 justify-center">
          <Loader2 className="size-4 animate-spin" />
          Загрузка…
        </div>
      ) : rows.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground text-sm">
          {q ? `Ничего не найдено по «${q}».` : 'Юрлиц пока нет — заведите первое.'}
        </Card>
      ) : (
        <div className="grid gap-2">
          {rows.map((row) => {
            const inn = requisitesInn(row.requisites)
            return (
              <Card key={row.id} className="p-4 flex flex-wrap items-center gap-x-6 gap-y-2">
                <div className="min-w-48 flex-1">
                  <div className="font-medium truncate flex items-center gap-2">
                    {row.name}
                    {!row.isActive && <Badge variant="secondary">Не активен</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {inn ? `ИНН ${inn}` : 'Реквизиты не заполнены'}
                  </div>
                </div>
                <div className="flex items-center gap-4 text-sm text-muted-foreground tabular-nums">
                  <span>
                    Договоры: <span className="text-foreground">{row.contractsCount}</span>
                  </span>
                  <span>
                    Заявки: <span className="text-foreground">{row.ordersCount}</span>
                  </span>
                </div>
                <Button variant="outline" size="sm" onClick={() => openEdit(row)}>
                  <Pencil className="size-4" />
                  Править
                </Button>
              </Card>
            )
          })}
          {hasMore && (
            <Button variant="outline" onClick={loadMore} disabled={loadingMore}>
              {loadingMore && <Loader2 className="size-4 animate-spin" />}
              Показать ещё
            </Button>
          )}
        </div>
      )}

      {/* ── Диалог правки: имя + реквизиты + статус ── */}
      <Dialog open={editRow !== null} onOpenChange={(open) => !open && setEditRow(null)}>
        <DialogContent className="sm:max-w-md sm:max-h-[85vh] overflow-y-auto">
          {editRow && (
            <>
              <DialogHeader>
                <DialogTitle>Правка юрлица</DialogTitle>
                <DialogDescription>
                  Реквизиты сохраняются целиком: пустые поля удалят ранее заполненные
                  значения. Деактивация скрывает юрлицо из выбора при создании заявки,
                  но не трогает существующие договоры и заявки.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="le-edit-name">Название</Label>
                  <Input
                    id="le-edit-name"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                  />
                </div>
                {renderRequisitesFields(editRequisites, setEditRequisites, 'le-edit')}
              </div>
              <DialogFooter className="sm:justify-between">
                <Button
                  variant="outline"
                  onClick={handleToggleActive}
                  disabled={togglingActive || saving}
                >
                  {togglingActive ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : editRow.isActive ? (
                    <ShieldOff className="size-4" />
                  ) : (
                    <ShieldCheck className="size-4" />
                  )}
                  {editRow.isActive ? 'Деактивировать' : 'Снова активное'}
                </Button>
                <Button onClick={handleSave} disabled={saving || togglingActive}>
                  {saving && <Loader2 className="size-4 animate-spin" />}
                  Сохранить
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
