import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Container, UserRound } from 'lucide-react'
import { getEmployeeByToken, SESSION_COOKIE } from '@/lib/auth'
import { db } from '@/lib/db'
import { LEAD_ACTIVE_STATUSES } from '@/lib/leads'
import { LogoutButton } from '@/components/admin/LogoutButton'
import { AdminNav } from '@/components/admin/AdminNav'
import { AdminBottomNav } from '@/components/admin/AdminBottomNav'
import { GlobalSearch } from '@/components/admin/GlobalSearch'
import { activeOrdersTotal, orderStatusCounts } from '@/lib/order-counts'

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
  // DF-21: бейдж «Заявки» считается из ЕДИНОГО источника с табами
  // списка (orderStatusCounts + activeOrdersTotal, lib/order-counts.ts) —
  // e2e сверяет число бейджа с суммой активных табов API.
  const [orderCounts, activeLeads] = await Promise.all([
    orderStatusCounts(),
    db.lead.count({ where: { status: { in: [...LEAD_ACTIVE_STATUSES] } } }),
  ])
  const activeOrders = activeOrdersTotal(orderCounts)

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
            <AdminNav isMaster={isMaster} counts={{ '/admin/orders': activeOrders, '/admin/leads': activeLeads }} />
          </nav>
          <div className="border-t border-sidebar-border px-4 py-3 flex items-center gap-3 shrink-0">
            {/* DF-09: профиль (в т.ч. TOTP) — вне меню (гард DF-21), ссылка — здесь */}
            <Link
              href="/admin/profile"
              className="text-sm text-muted-foreground truncate hover:text-foreground"
            >
              {employee.name}
            </Link>
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
                {/* DF-09: на телефоне профиль — иконка в шапке рядом с «Выйти» */}
                <Link href="/admin/profile" aria-label="Профиль" className="flex">
                  <UserRound className="size-4 text-muted-foreground" />
                </Link>
                <LogoutButton />
              </div>
            </div>
          </header>

          {/* Нижняя панель навигации телефона — в конце layout (fixed),
              контенту ниже задан отступ pb-20; DF-21 */}
          <main className="px-4 md:px-6 py-6 pb-20 md:pb-6">{children}</main>

          <footer className="border-t hidden md:block">
            <div className="px-4 md:px-6 h-12 flex items-center text-sm text-muted-foreground">
              Logix MVP · рабочее место менеджера: заявки · запросы · подрядчики
            </div>
          </footer>
        </div>
      </div>

      {/* DF-21: нижняя панель навигации телефона (≤768px) */}
      <AdminBottomNav isMaster={isMaster} />
    </div>
  )
}
