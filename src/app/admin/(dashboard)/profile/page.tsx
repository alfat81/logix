import Link from 'next/link'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { getEmployeeByToken, SESSION_COOKIE } from '@/lib/auth'
import { ProfileTotpSection } from '@/components/admin/profile/ProfileTotpSection'
import { ProfileSessionsSection } from '@/components/admin/profile/ProfileSessionsSection'

// ─── Профиль сотрудника (DF-09) ───────────────────────────────────────
// Личная страница мастера и менеджера: управление двухфакторным входом
// (включение — QR + код из приложения; выключение — с паролем;
// одноразовые коды восстановления) и сеансами («Выйти на всех
// устройствах»). В меню (nav-config) не входит сознательно: состав
// меню зафиксирован гард-тестом DF-21 по утверждённому наброску,
// ссылка — в пользовательском блоке сайдбара и в шапке телефона.

export default async function ProfilePage() {
  const employee = await getEmployeeByToken((await cookies()).get(SESSION_COOKIE)?.value)
  if (!employee) redirect('/admin/login')

  return (
    <div className="mx-auto max-w-2xl grid gap-4">
      <div className="grid gap-1">
        <Link
          href="/admin"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground md:hidden"
        >
          <ArrowLeft className="size-4" />
          На главную
        </Link>
        <h1 className="text-lg font-semibold">Профиль</h1>
        <p className="text-sm text-muted-foreground">
          {employee.name} · {employee.roles.includes('master') ? 'мастер' : 'менеджер'}
        </p>
      </div>
      <ProfileTotpSection />
      <ProfileSessionsSection />
    </div>
  )
}
