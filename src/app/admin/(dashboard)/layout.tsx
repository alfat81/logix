import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Container } from 'lucide-react'
import { getEmployeeByToken, SESSION_COOKIE } from '@/lib/auth'
import { db } from '@/lib/db'
import { ORDER_ACTIVE_STATUSES } from '@/lib/order-constants'
import { LEAD_ACTIVE_STATUSES } from '@/lib/leads'
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
//
// P1-18 (BRANDBOOK §4): трёхколоночный workspace 280 | 1fr | 320.
// Навигация — ФИКСИРОВАННАЯ левая панель 280px (Sand, §1.1: токены
// этапа A — потребление в этапе B), шапка с глобальным поиском —
// над рабочей областью. Третья колонка (320px) задаётся страницами
// (главная, лид) и при < 1280px складывается вниз. На мобильных (до md)
// меню остаётся компактной полосой прокрутки под шапкой, 375px — без
// выхода за экран.
//
// v0.3.1 (§4.1): счётчики навигации — числа активных сделок
// (заявки/лиды по группам ACTIVE из lib) считает layout — один
// серверный рендер, два быстрых count-запроса (масштаб D1: до 3
// менеджеров, десятки сделок).
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const employee = await getEmployeeByToken((await cookies()).get(SESSION_COOKIE)?.value)
  if (!employee) {
    redirect('/admin/login')
  }

  // Ж6в: меню фильтрует мастерские пункты (Сотрудники) — признак
  // читается здесь, один раз, из уже загруженной сессии.
  const isMaster = employee.roles.includes('master')

  // §4.1: счётчики активных объектов у сделочных пунктов меню.
  const [activeOrders, activeLeads] = await Promise.all([
    db.order.count({ where: { status: { in: [...ORDER_ACTIVE_STATUSES] } } }),
    db.lead.count({ where: { status: { in: [...LEAD_ACTIVE_STATUSES] } } }),
  ])

  return (
    <div className="min-h-screen">
      <div className="md:flex">
        {/* Фиксированная навигация 280px (§4.1):Sand-панель, группировка
            разделов внутри AdminNav; при длинных списках прокручивается
            сама, пользовательский блок прижат к низу панели. */}
        <aside className="hidden md:flex md:fixed md:inset-y-0 md:left-0 md:z-30 md:w-[280px] md:flex-col bg-sidebar border-r border-sidebar-border">
          <div className="h-14 flex items-center gap-2 px-4 border-b border-sidebar-border shrink-0">
            <span className="flex size-7 items-center justify-center rounded-md bg-foreground text-background">
              <Container className="size-4" />
            </span>
            <Link href="/admin" className="font-semibold hover:opacity-80">
              Logix
            </Link>
          </div>
          <nav className="flex-1 overflow-y-auto py-4 px-3">
            <AdminNav variant="sidebar" isMaster={isMaster} counts={{ '/admin/orders': activeOrders, '/admin/leads': activeLeads }} />
          </nav>
          <div className="border-t border-sidebar-border px-4 py-3 flex items-center gap-3 shrink-0">
            <span className="text-sm text-muted-foreground truncate">{employee.name}</span>
            <div className="ml-auto shrink-0">
              <LogoutButton />
            </div>
          </div>
        </aside>

        {/* Рабочая область 1fr: на md+ сдвиг на ширину фиксированной панели. */}
        <div className="flex-1 min-w-0 md:pl-[280px]">
          {/* Шапка sticky: дропдаун глобального поиска должен накрывать
              контент, а не обрезаться прокруткой страницы. */}
          <header className="sticky top-0 z-40 border-b bg-card">
            <div className="px-4 h-14 flex items-center gap-3">
              <div className="md:hidden flex items-center gap-2 font-semibold shrink-0">
                <span className="flex size-7 items-center justify-center rounded-md bg-foreground text-background">
                  <Container className="size-4" />
                </span>
                <Link href="/admin" className="hover:opacity-80">
                  Logix
                </Link>
              </div>
              <GlobalSearch />
              <div className="md:hidden flex items-center gap-3 shrink-0 ml-auto">
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

          <main className="px-4 md:px-6 py-6">{children}</main>

          <footer className="border-t">
            <div className="px-4 md:px-6 h-12 flex items-center text-sm text-muted-foreground">
              Logix MVP · рабочее место менеджера: заявки · запросы · подрядчики
            </div>
          </footer>
        </div>
      </div>
    </div>
  )
}
