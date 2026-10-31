'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { KeyRound, Loader2, ShieldCheck, ShieldOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'

// Дата+время включения TOTP в строке статуса (формат RULES 2.7).
// Локальный хелпер: серверный fmtRuDate (activity.ts) тянет db —
// клиентским компонентам импорт запрещён, второго экспорта в lib нет
// (IC-14).
function fmtDateTime(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  return `${dd}.${mm}.${d.getFullYear()}, ${time}`
}

// ─── Профиль: двухфакторная аутентификация (DF-09) ───────────────────
// Мастер и менеджер (у менеджера — по желанию, карточка DF-09).
// Состояния: загрузка / выключено (кнопка «Включить») / включено
// (дата + «Выключить» с паролем). Включение: QR otpauth:// (SVG с
// сервера) + секрет текстом для ручного ввода + код из приложения;
// после включения один раз показываются коды восстановления.

type TotpStatus = { enabled: boolean; enabledAt: string | null }
type TotpSetup = { secret: string; otpauthUri: string; qrSvg: string }

export function ProfileTotpSection() {
  const router = useRouter()
  const { toast } = useToast()
  const [status, setStatus] = useState<TotpStatus | null>(null)
  const [setup, setSetup] = useState<TotpSetup | null>(null)
  const [code, setCode] = useState('')
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadStatus = useCallback(async () => {
    setError(null)
    try {
      const res = await fetch('/api/admin/profile/totp')
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Не удалось получить статус')
      setStatus({ enabled: Boolean(data.enabled), enabledAt: data.enabledAt ?? null })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки')
    }
  }, [])

  useEffect(() => {
    loadStatus()
  }, [loadStatus])

  const startSetup = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/profile/totp/setup')
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Не удалось начать настройку')
      setSetup(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка настройки')
    } finally {
      setBusy(false)
    }
  }

  const confirmEnable = async () => {
    if (!setup) return
    setBusy(true)
    try {
      const res = await fetch('/api/admin/profile/totp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret: setup.secret, code: code.replace(/\D/g, '') }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Код не принят')
      setSetup(null)
      setCode('')
      setRecoveryCodes(data.recoveryCodes ?? [])
      await loadStatus()
      router.refresh()
    } catch (e) {
      toast({
        title: 'Не удалось включить',
        description: e instanceof Error ? e.message : '',
        variant: 'destructive',
      })
    } finally {
      setBusy(false)
    }
  }

  const confirmDisable = async () => {
    setBusy(true)
    try {
      const res = await fetch('/api/admin/profile/totp', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Неверный пароль')
      setPassword('')
      setRecoveryCodes(null)
      await loadStatus()
      router.refresh()
      toast({ title: 'Двухфакторный вход выключен' })
    } catch (e) {
      toast({
        title: 'Не удалось выключить',
        description: e instanceof Error ? e.message : '',
        variant: 'destructive',
      })
    } finally {
      setBusy(false)
    }
  }

  if (error && !status) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <KeyRound className="size-4" />
            Двухфакторный вход
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">{error}</CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <KeyRound className="size-4" />
          Двухфакторный вход
        </CardTitle>
        <CardDescription>
          Второй шаг при входе в кабинет: код из приложения-аутентификатора
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {!status && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Загрузка…
          </div>
        )}

        {status && !status.enabled && !setup && !recoveryCodes && (
          <div className="flex flex-wrap items-center gap-3">
            <ShieldOff className="size-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Двухфакторный вход выключен</span>
            <Button size="sm" onClick={startSetup} disabled={busy}>
              Включить
            </Button>
          </div>
        )}

        {setup && (
          <div className="grid gap-3">
            <p className="text-sm">
              Отсканируйте QR в приложении-аутентификаторе (Google Authenticator, Яндекс.
              Ключ и т.п.) или введите секрет вручную, затем введите код из приложения.
            </p>
            <div
              className="w-48 h-48 border rounded-md p-2 bg-white"
              aria-label="QR-код для приложения-аутентификатора"
              dangerouslySetInnerHTML={{ __html: setup.qrSvg }}
            />
            <div className="grid gap-1">
              <Label htmlFor="totp-secret">Секрет для ручного ввода</Label>
              <Input id="totp-secret" readOnly value={setup.secret} className="font-mono text-xs" />
            </div>
            <div className="grid gap-1 max-w-48">
              <Label htmlFor="totp-code">Код из приложения</Label>
              <Input
                id="totp-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="000000"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex gap-2">
              <Button size="sm" onClick={confirmEnable} disabled={busy || code.replace(/\D/g, '').length !== 6}>
                {busy && <Loader2 className="size-4 animate-spin" />}
                Подтвердить
              </Button>
              <Button size="sm" variant="outline" onClick={() => setSetup(null)} disabled={busy}>
                Отмена
              </Button>
            </div>
          </div>
        )}

        {recoveryCodes && (
          <div className="grid gap-2 rounded-md border p-3">
            <p className="text-sm font-medium">
              Коды восстановления — покажем один раз, сохраните их в надёжном месте
            </p>
            <p className="text-xs text-muted-foreground">
              Каждый код работает один раз, если телефон недоступен. После этого входа
              список можно закрыть.
            </p>
            <div className="grid grid-cols-2 gap-1 font-mono text-xs sm:grid-cols-5">
              {recoveryCodes.map((c) => (
                <span key={c}>{c}</span>
              ))}
            </div>
            <div>
              <Button size="sm" variant="outline" onClick={() => setRecoveryCodes(null)}>
                Сохранено, закрыть
              </Button>
            </div>
          </div>
        )}

        {status?.enabled && !recoveryCodes && (
          <div className="grid gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <ShieldCheck className="size-4" />
              <span className="text-sm">
                Включён
                {status.enabledAt ? ` с ${fmtDateTime(new Date(status.enabledAt))}` : ''}
              </span>
            </div>
            <div className="grid gap-1 max-w-64">
              <Label htmlFor="totp-disable-password">Пароль для выключения</Label>
              <Input
                id="totp-disable-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div>
              <Button
                size="sm"
                variant="outline"
                onClick={confirmDisable}
                disabled={busy || !password}
              >
                {busy && <Loader2 className="size-4 animate-spin" />}
                Выключить
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
