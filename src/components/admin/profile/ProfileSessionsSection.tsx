'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'

// ─── Профиль: «Выйти на всех устройствах» (DF-09) ────────────────────
// Удаляет ВСЕ сессии текущего сотрудника, включая текущую: после
// ответа клиент уходит на страницу входа. Телефон теряется —
// сессии на нём тоже умирают (критерий приёмки карточки).

export function ProfileSessionsSection() {
  const router = useRouter()
  const { toast } = useToast()
  const [busy, setBusy] = useState(false)

  const revokeAll = async () => {
    setBusy(true)
    try {
      const res = await fetch('/api/admin/profile/sessions', { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Не удалось завершить сессии')
      toast({ title: `Сеансы завершены (${data.revoked ?? 0}). Выполните вход заново.` })
      router.replace('/admin/login')
      router.refresh()
    } catch (e) {
      toast({
        title: 'Ошибка',
        description: e instanceof Error ? e.message : '',
        variant: 'destructive',
      })
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <LogOut className="size-4" />
          Сеансы
        </CardTitle>
        <CardDescription>
          Завершить вход на всех устройствах, включая текущее
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button size="sm" variant="outline" onClick={revokeAll} disabled={busy}>
          {busy && <Loader2 className="size-4 animate-spin" />}
          Выйти на всех устройствах
        </Button>
      </CardContent>
    </Card>
  )
}
