import { cookies } from 'next/headers'
import Link from 'next/link'
import { ShieldOff } from 'lucide-react'
import { getEmployeeByToken, SESSION_COOKIE } from '@/lib/auth'
import { ReferencesScreen } from '@/components/admin/references/ReferencesScreen'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

// Справочники (DF-17): страны, валюты, упаковка, условия поставки.
// Экран для мастера и менеджера: правки — write:true (P1-09, API
// отдаёт 403 без права), чтение — любой сотрудник. Не master-only:
// менеджер пополняет справочник ходовыми видами упаковки и правит
// подписи (карточка DF-17).
export default async function ReferencesPage() {
  const employee = await getEmployeeByToken((await cookies()).get(SESSION_COOKIE)?.value)

  if (!employee) {
    return (
      <Card className="p-8 grid gap-3 justify-items-center text-center max-w-lg mx-auto">
        <ShieldOff className="size-8 text-muted-foreground" />
        <div className="grid gap-1">
          <h1 className="text-lg font-semibold">Требуется вход</h1>
          <p className="text-sm text-muted-foreground">
            Сессия истекла — войдите заново.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/admin/login">Войти</Link>
        </Button>
      </Card>
    )
  }

  // Право правки: read-only ролей пока нет (P1-09 — write-маркер
  // держит API), поэтому интерфейс правки виден всем вошедшим;
  // read-only роль появится — фильтр по roles добавляется здесь,
  // API уже защищён.
  const canWrite = true
  return <ReferencesScreen canWrite={canWrite} />
}
