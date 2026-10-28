'use client'

import { useEffect, useState } from 'react'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
import { useToast } from '@/hooks/use-toast'
import { readApiResponse } from '@/lib/api-client'
import { isPhoneNormalized } from '@/lib/phone'
import { CLIENT_PASSWORD_MIN } from '@/lib/client-constants'
import { generatePassword } from '@/components/admin/employee/password'

// ─── Диалог сотрудника клиента (DF-02A Блок 5) ──────────────────────
// Создание и правка пользователя кабинета. Режимы:
//  • create — пароль опционален: пустой = «контакт без входа» (P1-07);
//  • edit — пустой пароль = «не менять», снять пароль — отдельная
//    кнопка (подтверждение не нужно: операция обратимая, вход
//    восстанавливается новой выдачей).
// Правила сервера (lib/company-users.ts): пароль без нормализованного
// телефона не выдаётся, дубли — 409; UI подсказывает, но не дублирует
// валидацию телефонов/имён — ошибка сервера показывается как есть.

export type CustomerUserRow = {
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

export function CustomerUserDialog({
  customerId,
  user,
  open,
  onClose,
  onSaved,
}: {
  customerId: string
  // null — режим создания
  user: CustomerUserRow | null
  open: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const { toast } = useToast()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [busy, setBusy] = useState(false)

  const editing = user !== null

  useEffect(() => {
    if (open) {
      setName(user?.name ?? '')
      setPhone(user?.phone ?? '')
      setEmail(user?.email ?? '')
      setPassword('')
      setShowPwd(false)
    }
  }, [open, user])

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
            // Пустой пароль при создании = человек без входа (null)
            ...(password ? { password } : { password: null }),
          }
      const res = await fetch(`/api/admin/customers/${customerId}/access`, {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await readApiResponse<{ error?: string }>(res)
      if (!res.ok) throw new Error(data.error || 'Не удалось сохранить')
      toast({ title: editing ? 'Пользователь сохранён' : 'Сотрудник добавлен' })
      onSaved()
      onClose()
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

  const revokePassword = async () => {
    if (!user) return
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/customers/${customerId}/access`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, password: null }),
      })
      const data = await readApiResponse<{ error?: string }>(res)
      if (!res.ok) throw new Error(data.error || 'Не удалось снять пароль')
      toast({ title: 'Пароль снят — вход этому сотруднику закрыт' })
      onSaved()
      onClose()
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

  const phoneHint = phone.trim() && !isPhoneNormalized(phone.trim())
    ? 'Номер не приводится к +7… — вход по нему будет невозможен'
    : 'Логин в кабинет — нормализованный российский номер'

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? 'Править сотрудника' : 'Добавить сотрудника'}</DialogTitle>
          <DialogDescription>
            {editing
              ? 'Контакты и пароль человека. Смена/снятие пароля завершает его активные сеансы.'
              : 'Пароль необязателен: без него человек сохранится как контакт без входа. Передайте пароль лично — восстановления по SMS нет.'}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="cu-name">Имя</Label>
            <Input
              id="cu-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Иван Иванов"
              disabled={busy}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="cu-phone">Телефон (логин)</Label>
            <Input
              id="cu-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+79001234567"
              className="font-mono"
              disabled={busy}
            />
            <p className="text-xs text-muted-foreground">{phoneHint}</p>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="cu-email">Email</Label>
            <Input
              id="cu-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ivan@company.ru"
              disabled={busy}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="cu-password">
              {editing ? 'Новый пароль' : 'Пароль'}
              {editing && (
                <span className="text-xs font-normal text-muted-foreground"> (пусто — не менять)</span>
              )}
            </Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  id="cu-password"
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
        <DialogFooter className="sm:justify-between">
          {editing && user.hasPassword ? (
            <Button type="button" variant="ghost" onClick={revokePassword} disabled={busy} className="text-destructive hover:text-destructive">
              Снять пароль
            </Button>
          ) : (
            <span />
          )}
          <Button onClick={submit} disabled={busy}>
            {busy && <Loader2 className="size-4 animate-spin" />}
            {editing ? 'Сохранить' : 'Добавить'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
