'use client'

import { useState } from 'react'
import { Eye, EyeOff, KeyRound, Loader2, RefreshCw, ShieldOff } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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

// ─── Доступ клиента в кабинет (И1, админ-сторона) ───────────────────
// Выдача/смена/отзыв пароля кабинета прямо из карточки клиента.
// Модель — как у подрядчика (Г2/Г3): учётку выдаёт менеджер. Смена и
// отзыв рвут живые сессии клиента (роут access, паттерн Ж6в). Хеш
// наружу не отдаётся никогда — карточка знает только факт «выдан/не
// выдан» (hasCabinetAccess из GET карточки).

function generatePassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
  const bytes = new Uint8Array(12)
  crypto.getRandomValues(bytes)
  return [...bytes].map((b) => alphabet[b % alphabet.length]).join('')
}

export function CustomerCabinetAccess({
  customerId,
  hasCabinetAccess,
  phone,
  onChanged,
}: {
  customerId: string
  hasCabinetAccess: boolean
  phone: string | null
  onChanged: () => void
}) {
  const { toast } = useToast()
  const [pwdOpen, setPwdOpen] = useState(false)
  const [revokeOpen, setRevokeOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [busy, setBusy] = useState(false)

  // Вход в кабинет — по нормализованному телефону; без него доступ
  // мертворождён (роут access откажет 400, но честнее не давать
  // кнопку вовсе и объяснить, что сделать).
  const phoneOk = isPhoneNormalized(phone ?? '')

  const post = async (body: { password: string | null }, okTitle: string) => {
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/customers/${customerId}/access`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await readApiResponse<{ error?: string }>(res)
      if (!res.ok) throw new Error(data.error || 'Не удалось изменить доступ')
      toast({ title: okTitle })
      onChanged()
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

  const handleSave = async () => {
    if (password.trim().length < CLIENT_PASSWORD_MIN) {
      toast({
        title: `Пароль — минимум ${CLIENT_PASSWORD_MIN} символов`,
        variant: 'destructive',
      })
      return
    }
    await post({ password }, hasCabinetAccess ? 'Пароль кабинета изменён' : 'Доступ в кабинет выдан')
    setPwdOpen(false)
    setPassword('')
  }

  const handleRevoke = async () => {
    await post({ password: null }, 'Доступ в кабинет отозван')
    setRevokeOpen(false)
  }

  return (
    <Card className="p-0">
      <CardContent className="p-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <KeyRound className="size-4 text-muted-foreground" />
        <div className="min-w-44 flex-1">
          <div className="text-sm font-medium flex items-center gap-2">
            Доступ в кабинет клиента
            {hasCabinetAccess ? (
              <Badge className="bg-success text-success-foreground border-transparent" variant="outline">
                Выдан
              </Badge>
            ) : (
              <Badge variant="outline">Не выдан</Badge>
            )}
          </div>
          <div className="text-xs text-muted-foreground">
            {phoneOk
              ? hasCabinetAccess
                ? `Вход по телефону ${phone}. Смена пароля завершит активные сеансы.`
                : `Вход будет по телефону ${phone} и выданному паролю.`
              : 'Для входа в кабинет нужен нормализованный российский телефон клиента (+7…) — сначала заполните его.'}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={!phoneOk || busy}
            onClick={() => {
              setPassword('')
              setPwdOpen(true)
            }}
          >
            {hasCabinetAccess ? (
              <>
                <RefreshCw className="size-4" />
                Сменить пароль
              </>
            ) : (
              <>
                <KeyRound className="size-4" />
                Выдать доступ
              </>
            )}
          </Button>
          {hasCabinetAccess && (
            <Button
              size="sm"
              variant="outline"
              className="text-destructive hover:text-destructive"
              disabled={busy}
              onClick={() => setRevokeOpen(true)}
            >
              <ShieldOff className="size-4" />
              Отозвать
            </Button>
          )}
        </div>
      </CardContent>

      {/* Диалог выдачи/смены пароля */}
      <Dialog open={pwdOpen} onOpenChange={setPwdOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {hasCabinetAccess ? 'Сменить пароль кабинета' : 'Выдать доступ в кабинет'}
            </DialogTitle>
            <DialogDescription>
              Передайте пароль клиенту лично — восстановления по SMS в MVP нет.
              {hasCabinetAccess && ' Смена завершит все активные сеансы клиента.'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="client-password">Пароль</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  id="client-password"
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
              <Button type="button" variant="outline" onClick={() => setPassword(generatePassword())}>
                Сгенерировать
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Минимум {CLIENT_PASSWORD_MIN} символов.
            </p>
          </div>
          <DialogFooter>
            <Button onClick={handleSave} disabled={busy}>
              {busy && <Loader2 className="size-4 animate-spin" />}
              {hasCabinetAccess ? 'Сменить пароль' : 'Выдать доступ'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Диалог отзыва доступа */}
      <Dialog open={revokeOpen} onOpenChange={setRevokeOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Отозвать доступ в кабинет?</DialogTitle>
            <DialogDescription>
              Клиент потеряет вход в кабинет немедленно: пароль снимается, активные
              сеансы завершаются. Запросы и заявки клиента не удаляются — доступ
              можно выдать заново в любой момент.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRevokeOpen(false)} disabled={busy}>
              Отмена
            </Button>
            <Button variant="destructive" onClick={handleRevoke} disabled={busy}>
              {busy && <Loader2 className="size-4 animate-spin" />}
              Отозвать доступ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
