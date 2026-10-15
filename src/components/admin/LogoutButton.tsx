'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function LogoutButton() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  const handleLogout = async () => {
    setBusy(true)
    try {
      await fetch('/api/auth/employee/logout', { method: 'POST' })
    } catch {
      /* даже при ошибке сети уходим на логин — кука могла умереть */
    } finally {
      router.replace('/admin/login')
      router.refresh()
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={handleLogout} disabled={busy}>
      <LogOut className="size-4" />
      Выйти
    </Button>
  )
}
