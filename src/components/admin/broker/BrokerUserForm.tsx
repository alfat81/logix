'use client'

import { useEffect, useState } from 'react'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'
import { readApiResponse } from '@/lib/api-client'
import { CLIENT_PASSWORD_MIN } from '@/lib/client-constants'
import { generatePassword } from '@/components/admin/employee/password'

// ─── Форма сотрудника брокера (DF-02A Блок 5) ────────────────────────
// Создание и правка человека портала — выезд из BrokerUsersDialog
// (лимит 300, RULES 2.14). Режимы: create — пароль опционален (пусто =
// «контакт без входа»), edit — пусто = «не менять». Правила сервера
// (lib/company-users.ts): пароль без нормализованного телефона не
// выдаётся, дубли — 409; ошибка сервера показывается как есть.

export type BrokerUserRow = {
  id: string
  name: string
  phone: string | null
  email: string | null
  isActive: boolean
  isPrimary: boolean
  hasPassword: boolean
  lastLoginAt: string | null
  createdAt: string
}

export function BrokerUserForm({
  brokerId,
  // null — режим создания
  user,
  onDone,
  onCancel,
}: {
  brokerId: string
  user: BrokerUserRow | null
  onDone: () => void
  onCancel: () => void
}) {
  const { toast } = useToast()
  const editing = user !== null
  const [name, setName] = useState(user?.name ?? '')
  const [phone, setPhone] = useState(user?.phone ?? '')
  const [email, setEmail] = useState(user?.email ?? '')
  const [password, setPassword] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setName(user?.name ?? '')
    setPhone(user?.phone ?? '')
    setEmail(user?.email ?? '')
    setPassword('')
    setShowPwd(false)
  }, [user])

  const submit = async () => {
    if (!name.trim()) {
      toast({ title: 'Укажите имя пользователя', variant: 'destructive' })
      return
    }
    if (!editing && password && password.length < CLIENT_PASSWORD_MIN) {
      toast({ title: `Пароль — минимум ${CLIENT_PASSWORD_MIN} символов`, variant: 'destructive' })
      return
    }
    setBusy(true)
    try {
      const body = editing
        ? {
            userId: user.id,
            name,
            phone: phone.trim() || null,
            email: email.trim() || null,
            ...(password ? { password } : {}),
          }
        : {
            name,
            phone: phone.trim() || null,
            email: email.trim() || null,
            ...(password ? { password } : { password: null }),
          }
      const res = await fetch(`/api/admin/brokers/${brokerId}/users`, {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await readApiResponse<{ error?: string }>(res)
      if (!res.ok) throw new Error(data.error || 'Не удалось сохранить')
      toast({ title: editing ? 'Пользователь сохранён' : 'Сотрудник добавлен' })
      onDone()
    } catch (e) {
      toast({
        title: 'Ошибка',
        description: e instanceof Error ? e.message : '',
        variant: 'destructive',
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-3 rounded-lg border p-3">
      <div className="text-sm font-medium">
        {editing ? `Правка: ${user?.name}` : 'Новый сотрудник'}
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="bu-name">Имя</Label>
          <Input
            id="bu-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Пётр Брокеров"
            disabled={busy}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="bu-phone">Телефон (логин)</Label>
          <Input
            id="bu-phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+79001234567"
            className="font-mono"
            disabled={busy}
          />
        </div>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="bu-email">Email</Label>
          <Input
            id="bu-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={busy}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="bu-password">
            {editing ? 'Новый пароль (пусто — не менять)' : 'Пароль (пусто — без входа)'}
          </Label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                id="bu-password"
                type={showPwd ? 'text' : 'password'}
                className="pr-10"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                disabled={busy}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 -translate-y-1/2 size-7"
                onClick={() => setShowPwd((v) => !v)}
                aria-label={showPwd ? 'Скрыть пароль' : 'Показать пароль'}
              >
                {showPwd ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </Button>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => setPassword(generatePassword())}
              disabled={busy}
            >
              Сгенерировать
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Минимум {CLIENT_PASSWORD_MIN} символов.</p>
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel} disabled={busy}>
          Отмена
        </Button>
        <Button onClick={submit} disabled={busy}>
          {busy && <Loader2 className="size-4 animate-spin" />}
          {editing ? 'Сохранить' : 'Добавить'}
        </Button>
      </div>
    </div>
  )
}
