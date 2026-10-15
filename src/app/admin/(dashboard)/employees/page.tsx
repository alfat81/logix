import { cookies } from 'next/headers'
import Link from 'next/link'
import { ShieldOff } from 'lucide-react'
import { getEmployeeByToken, SESSION_COOKIE } from '@/lib/auth'
import { EmployeesList } from '@/components/admin/EmployeesList'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

// Сотрудники (Ж6в): учётные записи кабинета — создание, роли,
// деактивация, сброс пароля. Раздел мастер-only ЦЕЛИКОМ (в отличие
// от Ж6б, где мастеру принадлежал только флаг): список раскрывает
// телефоны и роли всех учёток. Право защищает API (роуты отдают 403
// менеджеру), эта обёртка лишь не показывает интерфейс без права —
// менеджеру, зашедшему по прямой ссылке, честная заглушка вместо
// пустого списка и злых тостов.
export default async function EmployeesPage() {
  const employee = await getEmployeeByToken((await cookies()).get(SESSION_COOKIE)?.value)

  if (!employee || !employee.roles.includes('master')) {
    return (
      <Card className="p-8 grid gap-3 justify-items-center text-center max-w-lg mx-auto">
        <ShieldOff className="size-8 text-muted-foreground" />
        <div className="grid gap-1">
          <h1 className="text-lg font-semibold">Раздел доступен только мастеру</h1>
          <p className="text-sm text-muted-foreground">
            Создание сотрудников, роли, деактивация и сброс пароля — привилегия
            мастера. Обратитесь к нему, если нужен доступ.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/admin">На главную</Link>
        </Button>
      </Card>
    )
  }

  return <EmployeesList currentEmployeeId={employee.id} />
}
