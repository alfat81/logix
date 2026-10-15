'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Container, Loader2, Lock, Phone } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { formatPhoneInput, normalizePhone } from '@/lib/phone'
import { readApiResponse } from '@/lib/api-client'

// Вход в клиентский кабинет (И1) — третий портал системы (роадмап,
// раздел 1: «три кабинета, не три роли»). Логин и пароль выдаёт
// менеджер: саморегистрации нет — без SMS-верификации телефона
// «регистрация на любой номер» открывала бы чужие заявки.
export default function ClientLoginPage() {
  const router = useRouter()
  const { toast } = useToast()
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Уже авторизован — сразу в кабинет
  useEffect(() => {
    fetch('/api/auth/client/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.authenticated) router.replace('/client')
      })
      .catch(() => {})
  }, [router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const normalized = normalizePhone(phone)
    if (!normalized || !password) {
      toast({ title: 'Заполните телефон и пароль', variant: 'destructive' })
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/auth/client/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: normalized, password }),
      })
      const data = await readApiResponse<{ error?: string; client?: { name: string } }>(res)
      if (!res.ok) throw new Error(data.error || 'Ошибка входа')

      toast({ title: `Добро пожаловать, ${data.client?.name ?? ''}` })
      router.replace('/client')
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

  return (
    <main className="min-h-screen flex items-center justify-center px-4 bg-muted/40">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-xl flex items-center justify-center gap-2">
            <Container className="size-5 text-muted-foreground" />
            Logix — кабинет клиента
          </CardTitle>
          <CardDescription>
            Телефон и пароль выдаёт ваш менеджер. Запросы на расчёт и статусы заявок — здесь.
          </CardDescription>
        </CardHeader>
        <CardContent>
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
        </CardContent>
      </Card>
    </main>
  )
}
