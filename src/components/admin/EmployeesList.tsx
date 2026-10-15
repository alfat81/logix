'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  KeyRound,
  Loader2,
  Pencil,
  Search,
  ShieldOff,
  ShieldCheck,
  UserPlus,
  X,
} from 'lucide-react'
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
import { formatPhoneInput } from '@/lib/phone'
import {
  EMPLOYEE_ROLES,
  EMPLOYEE_ROLE_LABELS,
  EMPLOYEE_PASSWORD_MIN,
  type EmployeeRoleName,
} from '@/lib/employees'

// ─── Сотрудники (Ж6в) — паттерн списка Ж4/Ж6а/Ж6б ───────────────
// Справочник учётных записей кабинета: роли, стартовый пароль,
// деактивация, сброс пароля — только мастер (право защищает API,
// UI-блоки для себя/менеджера — удобство). Страница /admin/employees
// не-мастеру отдаёт заглушку ещё на сервере, меню не показывает
// пункт вовсе; этот компонент рендерится только мастеру.
//
// Две строки ограничений «на себя»: деактивировать себя и снимать
// с себя роль мастера нельзя (API вернёт 400 — кнопки честно
// заблокированы с подсказкой). Защита последнего мастера живёт
// в API: её клиенту не видно, отказ приходит понятным тостом.

const PAGE_TAKE = 20

type EmployeeRow = {
  id: string
  name: string
  phone: string
  roles: EmployeeRoleName[]
  isActive: boolean
  createdAt: string
}

type EmployeesPage = {
  employees: EmployeeRow[]
  hasMore: boolean
  counts: { all: number }
}

// Стартовый/новый пароль: видимый текст — мастер задаёт его, чтобы
// передать сотруднику лично (скрывать от того, кто его придумывает,
// бессмысленно). Алфавит без похожих символов (0/O, 1/l/I).
function generatePassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
  const bytes = new Uint8Array(12)
  crypto.getRandomValues(bytes)
  return [...bytes].map((b) => alphabet[b % alphabet.length]).join('')
}

// Чипы-переключатели ролей: одна роль — одна кнопка, выбранные
// подсвечены. masterLocked — защита «себя не разжаловать» (API
// всё равно не пустит, кнопка честно объясняет почему).
function RoleChips({
  value,
  onChange,
  masterLocked,
  idPrefix,
}: {
  value: EmployeeRoleName[]
  onChange: (next: EmployeeRoleName[]) => void
  masterLocked: boolean
  idPrefix: string
}) {
  const toggle = (role: EmployeeRoleName) => {
    if (value.includes(role)) {
      // Последнюю роль снять нельзя — серверу нужен непустой массив
      // (пустой = учётка-замок, вход с ролями 403).
      if (value.length === 1) return
      onChange(value.filter((r) => r !== role))
    } else {
      onChange([...value, role])
    }
  }
  return (
    <div className="flex flex-wrap gap-2">
      {EMPLOYEE_ROLES.map((role) => {
        const active = value.includes(role)
        const locked = role === 'master' && masterLocked
        return (
          <Button
            key={role}
            id={`${idPrefix}-role-${role}`}
            type="button"
            size="sm"
            variant={active ? 'default' : 'outline'}
            aria-pressed={active}
            disabled={locked}
            title={locked ? 'Нельзя снять с себя роль мастера' : undefined}
            onClick={() => toggle(role)}
          >
            {EMPLOYEE_ROLE_LABELS[role]}
          </Button>
        )
      })}
    </div>
  )
}

export function EmployeesList({ currentEmployeeId }: { currentEmployeeId: string }) {
  const { toast } = useToast()

  const [rows, setRows] = useState<EmployeeRow[]>([])
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
  const [createPhone, setCreatePhone] = useState('')
  const [createPassword, setCreatePassword] = useState('')
  const [createRoles, setCreateRoles] = useState<EmployeeRoleName[]>(['manager'])

  // ── Диалог правки
  const [editRow, setEditRow] = useState<EmployeeRow | null>(null)
  const [saving, setSaving] = useState(false)
  const [togglingActive, setTogglingActive] = useState(false)
  const [editName, setEditName] = useState('')
  const [editPhone, setEditPhone] = useState('')
  const [editRoles, setEditRoles] = useState<EmployeeRoleName[]>([])

  // ── Диалог сброса пароля
  const [resetRow, setResetRow] = useState<EmployeeRow | null>(null)
  const [resetting, setResetting] = useState(false)
  const [resetPassword, setResetPassword] = useState('')

  const fetchPage = useCallback(
    async (skip: number): Promise<EmployeesPage> => {
      const params = new URLSearchParams()
      params.set('take', String(PAGE_TAKE))
      if (debouncedQ) params.set('q', debouncedQ)
      if (sort !== 'name_asc') params.set('sort', sort)
      if (skip) params.set('skip', String(skip))
      const res = await fetch(`/api/admin/employees?${params.toString()}`)
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
        setRows(data.employees)
        setHasMore(data.hasMore)
        setTotal(data.counts.all)
      })
      .catch((e) => {
        if (id !== reqId.current) return
        toast({
          title: 'Не удалось загрузить сотрудников',
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
      setRows((prev) => [...prev, ...data.employees])
      setHasMore(data.hasMore)
    } catch (e) {
      toast({
        title: 'Не удалось загрузить сотрудников',
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
      toast({ title: 'Укажите имя сотрудника', variant: 'destructive' })
      return
    }
    if (createPassword.length < EMPLOYEE_PASSWORD_MIN) {
      toast({
        title: `Пароль — минимум ${EMPLOYEE_PASSWORD_MIN} символов`,
        variant: 'destructive',
      })
      return
    }
    setCreating(true)
    try {
      const res = await fetch('/api/admin/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: createName.trim(),
          phone: createPhone,
          password: createPassword,
          roles: createRoles,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Не удалось создать сотрудника')

      toast({
        title: `Сотрудник «${data.employee.name}» создан`,
        description: `Логин: ${data.employee.phone}. Передайте пароль сотруднику лично.`,
      })
      setCreateOpen(false)
      setCreateName('')
      setCreatePhone('')
      setCreatePassword('')
      setCreateRoles(['manager'])
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

  // ── Правка (имя, телефон-логин, роли) ─────────────────────────
  const openEdit = (row: EmployeeRow) => {
    setEditRow(row)
    setEditName(row.name)
    setEditPhone(row.phone)
    setEditRoles(row.roles.length > 0 ? [...row.roles] : ['manager'])
  }

  const handleSave = async () => {
    if (!editRow) return
    if (!editName.trim()) {
      toast({ title: 'Укажите имя сотрудника', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/employees/${editRow.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName.trim(),
          phone: editPhone,
          roles: editRoles,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Не удалось сохранить сотрудника')

      toast({ title: `Сотрудник «${data.employee.name}» сохранён` })
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
      const res = await fetch(`/api/admin/employees/${editRow.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !wasActive }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Не удалось изменить статус')

      toast({
        title: wasActive
          ? `Сотрудник «${data.employee.name}» деактивирован`
          : `Сотрудник «${data.employee.name}» снова активен`,
        description: wasActive
          ? 'Вход заблокирован, сессии завершены. История его действий сохранена.'
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

  // ── Сброс пароля ──────────────────────────────────────────────
  const openReset = (row: EmployeeRow) => {
    setResetRow(row)
    setResetPassword('')
  }

  const handleReset = async () => {
    if (!resetRow) return
    if (resetPassword.length < EMPLOYEE_PASSWORD_MIN) {
      toast({
        title: `Пароль — минимум ${EMPLOYEE_PASSWORD_MIN} символов`,
        variant: 'destructive',
      })
      return
    }
    setResetting(true)
    try {
      const res = await fetch(`/api/admin/employees/${resetRow.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: resetPassword }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Не удалось сбросить пароль')

      toast({
        title: `Пароль «${resetRow.name}» обновлён`,
        description: resetRow.id === currentEmployeeId
          ? 'Ваша сессия завершена — войдите с новым паролем заново.'
          : 'Все сессии сотрудника завершены. Передайте новый пароль лично.',
      })
      setResetRow(null)
      setVersion((v) => v + 1)
    } catch (e) {
      toast({
        title: 'Ошибка сброса пароля',
        description: e instanceof Error ? e.message : '',
        variant: 'destructive',
      })
    } finally {
      setResetting(false)
    }
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Сотрудники</h1>
          <p className="text-sm text-muted-foreground">
            Учётные записи кабинета: роли и доступ
            {total !== null ? ` · всего: ${total}` : ''}
          </p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <UserPlus className="size-4" />
              Новый сотрудник
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Новый сотрудник</DialogTitle>
              <DialogDescription>
                Телефон — логин кабинета, пароль передайте сотруднику лично.
                Роль «Мастер» даёт управление этим справочником.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="emp-name">Имя</Label>
                <Input
                  id="emp-name"
                  placeholder="Иван Петров"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="emp-phone">Телефон (логин)</Label>
                <Input
                  id="emp-phone"
                  inputMode="tel"
                  placeholder="+7 (900) 555-01-02"
                  value={createPhone}
                  onChange={(e) => setCreatePhone(formatPhoneInput(e.target.value))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="emp-password">Стартовый пароль</Label>
                <div className="flex gap-2">
                  <Input
                    id="emp-password"
                    value={createPassword}
                    placeholder={`Минимум ${EMPLOYEE_PASSWORD_MIN} символов`}
                    onChange={(e) => setCreatePassword(e.target.value)}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setCreatePassword(generatePassword())}
                  >
                    Сгенерировать
                  </Button>
                </div>
              </div>
              <div className="grid gap-2">
                <Label>Роли</Label>
                <RoleChips
                  value={createRoles}
                  onChange={setCreateRoles}
                  masterLocked={false}
                  idPrefix="emp-create"
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

      {/* Паттерн Ж4: поиск с крестиком + сортировка */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pr-8 pl-8"
            placeholder="Имя или телефон…"
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
            <SelectItem value="name_asc">Имя А-Я</SelectItem>
            <SelectItem value="name_desc">Имя Я-А</SelectItem>
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
          {q ? `Ничего не найдено по «${q}».` : 'Сотрудников пока нет — заведите первую учётную запись.'}
        </Card>
      ) : (
        <div className="grid gap-2">
          {rows.map((row) => {
            const isSelf = row.id === currentEmployeeId
            return (
              <Card key={row.id} className="p-4 flex flex-wrap items-center gap-x-6 gap-y-2">
                <div className="min-w-48 flex-1">
                  <div className="font-medium truncate flex items-center gap-2">
                    {row.name}
                    {isSelf && <Badge variant="outline">Это вы</Badge>}
                    {!row.isActive && <Badge variant="secondary">Не активен</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground truncate tabular-nums">
                    {row.phone}
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  {row.roles.includes('master') && <Badge>Мастер</Badge>}
                  {row.roles.includes('manager') && <Badge variant="secondary">Менеджер</Badge>}
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => openEdit(row)}>
                    <Pencil className="size-4" />
                    Править
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => openReset(row)}>
                    <KeyRound className="size-4" />
                    Сброс пароля
                  </Button>
                </div>
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

      {/* ── Диалог правки: имя, телефон, роли + статус ── */}
      <Dialog open={editRow !== null} onOpenChange={(open) => !open && setEditRow(null)}>
        <DialogContent className="sm:max-w-md">
          {editRow && (
            <>
              <DialogHeader>
                <DialogTitle>Правка сотрудника</DialogTitle>
                <DialogDescription>
                  Смена телефона и ролей применяется к активным сессиям сразу.
                  {' '}Деактивация блокирует вход и завершает сессии, история действий сохраняется.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="emp-edit-name">Имя</Label>
                  <Input
                    id="emp-edit-name"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="emp-edit-phone">Телефон (логин)</Label>
                  <Input
                    id="emp-edit-phone"
                    inputMode="tel"
                    value={editPhone}
                    onChange={(e) => setEditPhone(formatPhoneInput(e.target.value))}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Роли</Label>
                  <RoleChips
                    value={editRoles}
                    onChange={setEditRoles}
                    masterLocked={editRow.id === currentEmployeeId}
                    idPrefix="emp-edit"
                  />
                  {editRow.id === currentEmployeeId && (
                    <p className="text-xs text-muted-foreground">
                      Себя нельзя разжаловать из мастеров — в системе всегда
                      должен остаться хотя бы один.
                    </p>
                  )}
                </div>
              </div>
              <DialogFooter className="sm:justify-between">
                <Button
                  variant="outline"
                  onClick={handleToggleActive}
                  disabled={
                    togglingActive ||
                    saving ||
                    editRow.id === currentEmployeeId
                  }
                  title={
                    editRow.id === currentEmployeeId
                      ? 'Нельзя деактивировать свой аккаунт'
                      : undefined
                  }
                >
                  {togglingActive ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : editRow.isActive ? (
                    <ShieldOff className="size-4" />
                  ) : (
                    <ShieldCheck className="size-4" />
                  )}
                  {editRow.id === currentEmployeeId
                    ? 'Это вы'
                    : editRow.isActive
                      ? 'Деактивировать'
                      : 'Снова активен'}
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

      {/* ── Диалог сброса пароля ── */}
      <Dialog open={resetRow !== null} onOpenChange={(open) => !open && setResetRow(null)}>
        <DialogContent className="sm:max-w-md">
          {resetRow && (
            <>
              <DialogHeader>
                <DialogTitle>Сброс пароля — {resetRow.name}</DialogTitle>
                <DialogDescription>
                  Все сессии сотрудника будут завершены, включая текущую, если
                  сбрасываете пароль себе. Новый пароль передайте сотруднику лично.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-2">
                <Label htmlFor="emp-reset-password">Новый пароль</Label>
                <div className="flex gap-2">
                  <Input
                    id="emp-reset-password"
                    value={resetPassword}
                    placeholder={`Минимум ${EMPLOYEE_PASSWORD_MIN} символов`}
                    onChange={(e) => setResetPassword(e.target.value)}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setResetPassword(generatePassword())}
                  >
                    Сгенерировать
                  </Button>
                </div>
              </div>
              <DialogFooter>
                <Button onClick={handleReset} disabled={resetting}>
                  {resetting && <Loader2 className="size-4 animate-spin" />}
                  Сбросить пароль
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
