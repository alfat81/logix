import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Container } from 'lucide-react'
import { getEmployeeByToken, SESSION_COOKIE } from '@/lib/auth'
import { LogoutButton } from '@/components/admin/LogoutButton'
import { AdminNav } from '@/components/admin/AdminNav'
import { GlobalSearch } from '@/components/admin/GlobalSearch'

// Защищённая зона кабинета (route group «(dashboard)» не влияет на URL):
// всё под /admin, кроме /admin/login, требует живую сессию сотрудника.
// Страница входа лежит рядом, но вне этой группы, поэтому сюда не
// попадает и циклического редиректа не возникает.
//
// Ж7: навигация переехала из горизонтальной шапки в БОКОВОЕ меню с
// секциями («Сделки», «Справочники») — при росте разделов Ж6а/Ж6б/Ж6в
// шапка переполнялась бы, боковая колонка растёт вниз без ущерба.
// На мобильных (до md) меню остаётся компактной полосой прокрутки
// под шапкой. В шапке — глобальный поиск (номер заявки, клиент,
// телефон: заявки и лиды).
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const employee = await getEmployeeByToken((await cookies()).get(SESSION_COOKIE)?.value)
  if (!employee) {
    redirect('/admin/login')
  }

  // Ж6в: меню фильтрует мастерские пункты (Сотрудники) — признак
  // читается здесь, один раз, из уже загруженной сессии.
  const isMaster = employee.roles.includes('master')

  return (
    <div className="min-h-screen flex flex-col">
      {/* Шапка sticky: дропдаун глобального поиска должен накрывать
          контент, а не обрезаться прокруткой страницы. */}
      <header className="sticky top-0 z-40 border-b bg-card">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-3">
          <div className="flex items-center gap-2 font-semibold shrink-0">
            <span className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Container className="size-4" />
            </span>
            <Link href="/admin" className="hover:opacity-80">
              Logix
            </Link>
          </div>
          <GlobalSearch />
          <div className="flex items-center gap-3 shrink-0 ml-auto">
            <span className="text-sm text-muted-foreground hidden sm:inline">{employee.name}</span>
            <LogoutButton />
          </div>
        </div>
      </header>

      {/* Мобильная навигация: горизонтальная полоса прокрутки
          (заголовки секций опущены — на узком экране место дороже). */}
      <div className="md:hidden border-b bg-card overflow-x-auto">
        <div className="px-2 py-1">
          <AdminNav variant="strip" isMaster={isMaster} />
        </div>
      </div>

      <div className="flex-1">
        <div className="max-w-6xl mx-auto flex">
          {/* Боковое меню (md+): sticky-колонка, при длинных списках
              разделов прокручивается сама, не тянув контент. */}
          <aside className="hidden md:block w-56 shrink-0">
            <div className="sticky top-14 h-[calc(100vh-3.5rem)] overflow-y-auto border-r py-4 pr-3">
              <AdminNav variant="sidebar" isMaster={isMaster} />
            </div>
          </aside>
          <main className="flex-1 min-w-0 px-4 py-6">{children}</main>
        </div>
      </div>

      <footer className="border-t">
        <div className="max-w-6xl mx-auto px-4 h-12 flex items-center text-sm text-muted-foreground">
          Logix MVP · рабочее место менеджера: заявки · лиды · подрядчики
        </div>
      </footer>
    </div>
  )
}
