import { cookies } from 'next/headers'
import Link from 'next/link'
import { ShieldOff } from 'lucide-react'
import { getEmployeeByToken, SESSION_COOKIE } from '@/lib/auth'
import { SettingsPanel } from '@/components/admin/SettingsPanel'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

// Настройки системы (DF-00D, D32): реестр SETTINGS + экран мастера.
// Раздел мастер-only ЦЕЛИКОМ (паттерн Ж6в): право защищает API
// (роуты отдают 403 менеджеру), эта обёртка лишь не показывает
// интерфейс без права — менеджеру, зашедшему по прямой ссылке,
// честная заглушка; пункт меню тоже скрыт (AdminNav, masterOnly).
export default async function SettingsPage() {
  const employee = await getEmployeeByToken((await cookies()).get(SESSION_COOKIE)?.value)

  if (!employee || !employee.roles.includes('master')) {
    return (
      <Card className="p-8 grid gap-3 justify-items-center text-center max-w-lg mx-auto">
        <ShieldOff className="size-8 text-muted-foreground" />
        <div className="grid gap-1">
          <h1 className="text-lg font-semibold">Раздел доступен только мастеру</h1>
          <p className="text-sm text-muted-foreground">
            Бизнес-параметры системы — окна рассылок, лимиты, пороги, подписи —
            меняет мастер. Обратитесь к нему, если нужна правка.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/admin">На главную</Link>
        </Button>
      </Card>
    )
  }

  return <SettingsPanel />
}
