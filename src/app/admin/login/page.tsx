'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, Lock, Phone, ShieldCheck } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { formatPhoneInput, normalizePhone } from '@/lib/phone'
import { masterLandingPath } from '@/lib/pulse'

// Страница входа для сотрудников (менеджеры/мастер). Порталы клиента,
// подрядчика и брокера появятся позже (раздел 1 LOGISTICS-ROADMAP.md)
// и получат свои отдельные страницы входа — это не одна роль в одном
// кабинете, а разные кабинеты.
//
// DF-07: вход МАСТЕРА открывает Пульс (первый пункт его меню);
// менеджер — как было, на главную «Требует внимания».
//
// DF-09: у сотрудника с включённым TOTP после пароля — второй шаг:
// код из приложения-аутентификатора или код восстановления
// («Использовать код восстановления»). Формулировки ошибок — те же
// общие («Неверный код подтверждения»), раскрывать вид кода нельзя.

export default function AdminLoginPage() {
  const router = useRouter()
  const { toast } = useToast()
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  // Второй шаг DF-09: challenge из ответа пароля, код, режим восстановления
  const [challenge, setChallenge] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [recoveryMode, setRecoveryMode] = useState(false)

  // Уже авторизован — сразу в кабинет (мастер — в Пульс, DF-07)
  useEffect(() => {
    fetch('/api/auth/employee/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.authenticated)
          router.replace(masterLandingPath(data.employee?.roles ?? []))
      })
      .catch(() => {})
  }, [router])

  const finishLogin = (data: { employee?: { roles?: string[] } }) => {
    toast({ title: 'Добро пожаловать' })
    router.replace(masterLandingPath(data.employee?.roles ?? []))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (challenge) return submitTotp()
    const normalized = normalizePhone(phone)
    if (!normalized || !password) {
      toast({ title: 'Заполните телефон и пароль', variant: 'destructive' })
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/auth/employee/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: normalized, password }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Ошибка входа')

      if (data.totpRequired) {
        // Пароль принят, ждём код (DF-09). Телефон/пароль не запрашиваем заново.
        setChallenge(data.challenge)
        setCode('')
        setRecoveryMode(false)
        return
      }
      finishLogin(data)
    } catch (err) {
      toast({
        title: 'Ошибка входа',
        description: err instanceof Error ? err.message : '',
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }

  const submitTotp = async () => {
    if (!challenge || !code.trim()) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/auth/employee/login/totp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challenge, code: code.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Ошибка входа')
      finishLogin(data)
    } catch (err) {
      toast({
        title: 'Ошибка входа',
        description: err instanceof Error ? err.message : '',
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }

  const backToPassword = () => {
    setChallenge(null)
    setCode('')
    setRecoveryMode(false)
    setPassword('')
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4 bg-muted/40">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-xl">Logix — вход</CardTitle>
          <CardDescription>
            {challenge ? 'Подтверждение входа' : 'Кабинет для сотрудников компании'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {challenge ? (
            <form onSubmit={handleSubmit} className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="totp-code">
                  {recoveryMode ? 'Код восстановления' : 'Код из приложения'}
                </Label>
                <div className="relative">
                  <ShieldCheck className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                  <Input
                    id="totp-code"
                    className="pl-9"
                    inputMode={recoveryMode ? 'text' : 'numeric'}
                    autoComplete="one-time-code"
                    placeholder={recoveryMode ? 'XXXX-XXXX' : '000000'}
                    maxLength={recoveryMode ? 9 : 6}
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    disabled={submitting}
                    required
                    autoFocus
                  />
                </div>
              </div>
              <Button type="submit" disabled={submitting || !code.trim()}>
                {submitting && <Loader2 className="size-4 animate-spin" />}
                Войти
              </Button>
              <div className="flex items-center justify-between text-sm">
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
                  onClick={() => {
                    setRecoveryMode(!recoveryMode)
                    setCode('')
                  }}
                  disabled={submitting}
                >
                  {recoveryMode ? 'Вернуться к коду приложения' : 'Использовать код восстановления'}
                </button>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
                  onClick={backToPassword}
                  disabled={submitting}
                >
                  Начать заново
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleSubmit} className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="phone">Телефон</Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                  <Input
                    id="phone"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder="+7 (900) 000-00-00"
                    className="pl-9"
                    value={phone}
                    onChange={(e) => setPhone(formatPhoneInput(e.target.value))}
                    disabled={submitting}
                    required
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="password">Пароль</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    className="pl-9"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={submitting}
                    required
                  />
                </div>
              </div>
              <Button type="submit" disabled={submitting}>
                {submitting && <Loader2 className="size-4 animate-spin" />}
                Войти
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  )
}
