'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, Pencil, Plus, ShieldCheck, ShieldOff } from 'lucide-react'
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
import { normalizePhone } from '@/lib/phone'
import {
  BROKER_PASSWORD_MIN,
  BROKER_KIND_LABELS,
} from '@/lib/brokers'

// ─── Справочник брокеров (Д) ────────────────────────────────────────
// GET ?active= / POST / PATCH — зеркало пула подрядчиков (Г3/Г5), но
// без воронки квалификации: брокер заводится напрямую, сразу с
// логином портала (телефон + пароль, нормализация на сервере).
// Деактивация — «доступ закрыт» (жёстче подрядчика: брокер — внешний
// участник, видит сделки целиком), связи со сделками не рвутся.
// DELETE не существует (как у подрядчиков и сотрудников).

type BrokerRow = {
  id: string
  companyName: string
  phone: string
  isInHouse: boolean
  isActive: boolean
  comment: string | null
  createdAt: string
  _count: { leadLinks: number; orderLinks: number }
}

type BrokerFilter = 'all' | 'active' | 'inactive'

type BrokerForm = {
  companyName: string
  phone: string
  password: string
  isInHouse: boolean
  comment: string
}

const EMPTY_FORM: BrokerForm = {
  companyName: '',
  phone: '',
  password: '',
  isInHouse: false,
  comment: '',
}

const fmtDate = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleDateString('ru-RU') : ''

export function BrokersList() {
  const { toast } = useToast()

  const [brokers, setBrokers] = useState<BrokerRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<BrokerFilter>('active')

  // Диалог создания
  const [createOpen, setCreateOpen] = useState(false)
  const [createForm, setCreateForm] = useState<BrokerForm>({ ...EMPTY_FORM })
  const [creating, setCreating] = useState(false)

  // Диалог правки
  const [editing, setEditing] = useState<BrokerRow | null>(null)
  const [editForm, setEditForm] = useState<BrokerForm>({ ...EMPTY_FORM })
  const [saving, setSaving] = useState(false)

  const load = useCallback(
    async (f: BrokerFilter) => {
      setLoading(true)
      try {
        const url =
          f === 'all'
            ? '/api/admin/brokers'
            : `/api/admin/brokers?active=${f === 'active'}`
        const res = await fetch(url)
        const data = await readApiResponse<{ brokers: BrokerRow[]; error?: string }>(res)
        if (!res.ok) throw new Error(data.error || 'Ошибка загрузки')
        setBrokers(data.brokers)
      } catch (e) {
        toast({
          title: 'Не удалось загрузить справочник',
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
    load(filter)
  }, [filter, load])

  const create = async () => {
    const companyName = createForm.companyName.trim()
    const phone = normalizePhone(createForm.phone)
    if (!companyName || !phone || !createForm.password) {
      toast({ title: 'Заполните название, телефон и пароль', variant: 'destructive' })
      return
    }
    setCreating(true)
    try {
      const res = await fetch('/api/admin/brokers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName,
          phone,
          password: createForm.password,
          isInHouse: createForm.isInHouse,
          ...(createForm.comment.trim() ? { comment: createForm.comment.trim() } : {}),
        }),
      })
      const data = await readApiResponse<{ error?: string }>(res)
      if (!res.ok) throw new Error(data.error || 'Не удалось создать брокера')
      toast({
        title: 'Брокер создан',
        description: 'Передайте логин и пароль представителю брокера',
      })
      setCreateOpen(false)
      setCreateForm({ ...EMPTY_FORM })
      load(filter)
    } catch (e) {
      toast({
        title: 'Ошибка',
        description: e instanceof Error ? e.message : '',
        variant: 'destructive',
      })
    } finally {
      setCreating(false)
    }
  }

  const openEdit = (b: BrokerRow) => {
    setEditing(b)
    setEditForm({
      companyName: b.companyName,
      phone: b.phone,
      password: '',
      isInHouse: b.isInHouse,
      comment: b.comment ?? '',
    })
  }

  const save = async () => {
    if (!editing) return
    const companyName = editForm.companyName.trim()
    if (!companyName) {
      toast({ title: 'Укажите название компании', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      const body: Record<string, unknown> = {
        companyName,
        // Телефон шлём как есть (сырой — сервер откажёт 400 с подсказкой,
        // нормализованный пройдёт); пустой пароль — не меняем вовсе
        isInHouse: editForm.isInHouse,
        comment: editForm.comment.trim() || null,
      }
      if (editForm.phone.trim() && editForm.phone.trim() !== editing.phone) {
        body.phone = editForm.phone.trim()
      }
      if (editForm.password) {
        body.password = editForm.password
      }
      const res = await fetch(`/api/admin/brokers/${editing.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await readApiResponse<{ message?: string; error?: string }>(res)
      if (!res.ok) throw new Error(data.error || 'Не удалось обновить брокера')
      toast({ title: data.message || 'Брокер обновлён' })
      setEditing(null)
      load(filter)
    } catch (e) {
      toast({
        title: 'Ошибка',
        description: e instanceof Error ? e.message : '',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (b: BrokerRow) => {
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/brokers/${b.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !b.isActive }),
      })
      const data = await readApiResponse<{ message?: string; error?: string }>(res)
      if (!res.ok) throw new Error(data.error || 'Не удалось изменить статус')
      toast({ title: data.message || 'Статус изменён' })
      load(filter)
    } catch (e) {
      toast({
        title: 'Ошибка',
        description: e instanceof Error ? e.message : '',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  const FILTERS: { key: BrokerFilter; label: string }[] = [
    { key: 'active', label: 'Действующие' },
    { key: 'inactive', label: 'Деактивированные' },
    { key: 'all', label: 'Все' },
  ]

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          {FILTERS.map((f) => (
            <Button
              key={f.key}
              size="sm"
              variant={filter === f.key ? 'default' : 'ghost'}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </Button>
          ))}
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" />
            Добавить брокера
          </Button>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Новый брокер</DialogTitle>
              <DialogDescription>
                Таможенный представитель, привлечённый на сделки. Телефон —
                логин портала (нормализуется сервером), пароль не короче{' '}
                {BROKER_PASSWORD_MIN} символов — передайте его представителю
                брокера лично.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="br-name">Название компании</Label>
                <Input
                  id="br-name"
                  placeholder="Например: ООО «Брок-Сервис»"
                  value={createForm.companyName}
                  onChange={(e) => setCreateForm((f) => ({ ...f, companyName: e.target.value }))}
                  disabled={creating}
                />
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="br-phone">Телефон (логин)</Label>
                  <Input
                    id="br-phone"
                    type="tel"
                    placeholder="+7 900 000-00-00"
                    value={createForm.phone}
                    onChange={(e) => setCreateForm((f) => ({ ...f, phone: e.target.value }))}
                    disabled={creating}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="br-pass">Пароль портала</Label>
                  <Input
                    id="br-pass"
                    type="text"
                    placeholder={`минимум ${BROKER_PASSWORD_MIN} символов`}
                    value={createForm.password}
                    onChange={(e) => setCreateForm((f) => ({ ...f, password: e.target.value }))}
                    disabled={creating}
                  />
                </div>
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="grid gap-0.5">
                  <span className="text-sm font-medium">Штатный брокер</span>
                  <span className="text-xs text-muted-foreground">
                    Пометка для справочника — пока все привлечённые
                  </span>
                </div>
                {/* Тумблер чипами — Switch-компонента в дизайн-системе
                    проекта нет, паттерн чипов TRANSPORT_TYPES (В3) */}
                <Button
                  type="button"
                  size="sm"
                  variant={createForm.isInHouse ? 'default' : 'outline'}
                  onClick={() => setCreateForm((f) => ({ ...f, isInHouse: !f.isInHouse }))}
                  disabled={creating}
                >
                  {createForm.isInHouse ? 'Штатный' : 'Привлечённый'}
                </Button>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="br-comment">Заметка</Label>
                <Textarea
                  id="br-comment"
                  rows={2}
                  placeholder="Кто рекомендовал, зона работы…"
                  value={createForm.comment}
                  onChange={(e) => setCreateForm((f) => ({ ...f, comment: e.target.value }))}
                  disabled={creating}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>
                Отмена
              </Button>
              <Button onClick={create} disabled={creating}>
                {creating && <Loader2 className="size-4 animate-spin" />}
                Создать
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm py-8 justify-center">
          <Loader2 className="size-4 animate-spin" />
          Загрузка…
        </div>
      ) : brokers.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground text-sm">
          {filter === 'active'
            ? 'Действующих брокеров нет — добавьте первого.'
            : filter === 'inactive'
              ? 'Деактивированных брокеров нет.'
              : 'Брокеров пока нет.'}
        </Card>
      ) : (
        <div className="grid gap-2">
          {brokers.map((b) => (
            <Card key={b.id} className="p-4 flex flex-wrap items-center gap-x-4 gap-y-2">
              <div className="min-w-52 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium">{b.companyName}</span>
                  <Badge variant="outline" className="text-xxs text-muted-foreground">
                    {b.isInHouse ? BROKER_KIND_LABELS.in_house : BROKER_KIND_LABELS.external}
                  </Badge>
                  {!b.isActive && (
                    <Badge variant="outline" className="text-xxs bg-destructive/10 text-destructive border-transparent">
                      деактивирован
                    </Badge>
                  )}
                </div>
                <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-2 mt-0.5">
                  <span className="font-mono">{b.phone}</span>
                  <span>· сделок: {b._count.leadLinks + b._count.orderLinks}</span>
                  <span>· с {fmtDate(b.createdAt)}</span>
                </div>
                {b.comment && (
                  <div className="text-xs text-muted-foreground truncate mt-0.5">{b.comment}</div>
                )}
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  onClick={() => openEdit(b)}
                  title="Править брокера"
                >
                  <Pencil className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  disabled={saving}
                  onClick={() => toggleActive(b)}
                  title={
                    b.isActive
                      ? 'Деактивировать — доступ в портал закроется, связи со сделками сохранятся'
                      : 'Вернуть в работу'
                  }
                >
                  {b.isActive ? (
                    <ShieldOff className="size-4 text-destructive" />
                  ) : (
                    <ShieldCheck className="size-4" />
                  )}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* ── Диалог правки брокера ─────────────────────────────── */}
      <Dialog open={editing !== null} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Править брокера</DialogTitle>
            <DialogDescription>
              Телефон — логин портала (нормализация и занятость — на сервере).
              Смена пароля закрывает действующие входы. Пустое поле пароля —
              пароль не меняется.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="eb-name">Название компании</Label>
              <Input
                id="eb-name"
                value={editForm.companyName}
                onChange={(e) => setEditForm((f) => ({ ...f, companyName: e.target.value }))}
                disabled={saving}
              />
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="eb-phone">Телефон (логин)</Label>
                <Input
                  id="eb-phone"
                  type="tel"
                  value={editForm.phone}
                  onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))}
                  disabled={saving}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="eb-pass">Новый пароль</Label>
                <Input
                  id="eb-pass"
                  type="text"
                  placeholder="не меняется"
                  value={editForm.password}
                  onChange={(e) => setEditForm((f) => ({ ...f, password: e.target.value }))}
                  disabled={saving}
                />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="grid gap-0.5">
                <span className="text-sm font-medium">Штатный брокер</span>
                <span className="text-xs text-muted-foreground">Пометка для справочника</span>
              </div>
              <Button
                type="button"
                size="sm"
                variant={editForm.isInHouse ? 'default' : 'outline'}
                onClick={() => setEditForm((f) => ({ ...f, isInHouse: !f.isInHouse }))}
                disabled={saving}
              >
                {editForm.isInHouse ? 'Штатный' : 'Привлечённый'}
              </Button>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="eb-comment">Заметка</Label>
              <Textarea
                id="eb-comment"
                rows={2}
                value={editForm.comment}
                onChange={(e) => setEditForm((f) => ({ ...f, comment: e.target.value }))}
                disabled={saving}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)} disabled={saving}>
              Отмена
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="size-4 animate-spin" />}
              Сохранить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
