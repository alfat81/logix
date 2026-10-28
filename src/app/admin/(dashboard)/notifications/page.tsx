import { cookies } from 'next/headers'
import Link from 'next/link'
import { ShieldOff } from 'lucide-react'
import { getEmployeeByToken, SESSION_COOKIE } from '@/lib/auth'
import { NotificationsJournal } from '@/components/admin/NotificationsJournal'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

// Журнал отправок (DF-04): экран очереди писем для мастера — статусы,
// ошибки доставки, кнопка «Повторить». Раздел master-only ЦЕЛИКОМ
// (паттерн /admin/settings): право защищает API (журнал и retry отдают
// 403 менеджеру), обёртка лишь не показывает интерфейс без права;
// пункт меню тоже скрыт (AdminNav, masterOnly).
export default async function NotificationsPage() {
  const employee = await getEmployeeByToken((await cookies()).get(SESSION_COOKIE)?.value)

  if (!employee || !employee.roles.includes('master')) {
    return (
      <Card className="p-8 grid gap-3 justify-items-center text-center max-w-lg mx-auto">
        <ShieldOff className="size-8 text-muted-foreground" />
        <div className="grid gap-1">
          <h1 className="text-lg font-semibold">Раздел доступен только мастеру</h1>
          <p className="text-sm text-muted-foreground">
            Журнал отправок содержит переписку со всеми сторонами сделок —
            работает с ним мастер. Обратитесь к нему, если письмо не дошло.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/admin">На главную</Link>
        </Button>
      </Card>
    )
  }

  return <NotificationsJournal />
}
