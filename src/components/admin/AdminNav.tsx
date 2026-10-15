'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Building2,
  ClipboardList,
  FileSignature,
  Home,
  Inbox,
  Landmark,
  ListChecks,
  Truck,
  UserCog,
  Users,
  type LucideIcon,
} from 'lucide-react'

// ─── Меню кабинета (Ж7) ─────────────────────────────────────────────
// Клиентский компонент ради usePathname (активный пункт) — layout
// остаётся серверным и просто рендерит <AdminNav isMaster={…}/>.
//
// Конфиг — единственное место, куда добавляются разделы (Ж6а —
// Клиенты и Договоры; Ж6б — Юрлица и Этапы; Ж6в — Сотрудники):
// masterOnly скрывает пункт у менеджера — управление учётками
// целиком мастерская привилегия (право при этом защищает API,
// скрытие пункта — удобство, не защита).

type NavItem = {
  href: string
  label: string
  icon: LucideIcon
  // Ж6в: пункт виден только мастеру (Сотрудники).
  masterOnly?: boolean
}

type NavSection = {
  // null — секция без заголовка (верхний одиночный пункт «Главная»).
  title: string | null
  items: NavItem[]
}

const NAV_SECTIONS: NavSection[] = [
  {
    title: null,
    items: [{ href: '/admin', label: 'Главная', icon: Home }],
  },
  {
    title: 'Сделки',
    items: [
      { href: '/admin/orders', label: 'Заявки', icon: ClipboardList },
      { href: '/admin/leads', label: 'Лиды', icon: Inbox },
    ],
  },
  {
    title: 'Справочники',
    items: [
      { href: '/admin/customers', label: 'Клиенты', icon: Users },
      { href: '/admin/contracts', label: 'Договоры', icon: FileSignature },
      { href: '/admin/legal-entities', label: 'Юрлица', icon: Building2 },
      { href: '/admin/stage-catalog', label: 'Этапы', icon: ListChecks },
      { href: '/admin/contractors', label: 'Подрядчики', icon: Truck },
      { href: '/admin/brokers', label: 'Брокеры', icon: Landmark },
      { href: '/admin/employees', label: 'Сотрудники', icon: UserCog, masterOnly: true },
    ],
  },
]

// Активный пункт: /admin — только точное совпадение (иначе «Главная»
// подсвечена всегда), остальные — по префиксу, чтобы карточка
// /admin/orders/<id> подсвечивала «Заявки».
function isActive(pathname: string, href: string): boolean {
  return href === '/admin' ? pathname === '/admin' : pathname.startsWith(href)
}

function itemClasses(active: boolean): string {
  const base =
    'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors whitespace-nowrap'
  return active
    ? `${base} bg-accent text-accent-foreground font-medium`
    : `${base} text-muted-foreground hover:text-foreground hover:bg-accent/50`
}

// variant="sidebar" — вертикальное меню с заголовками секций (md+).
// variant="strip" — горизонтальная полоса прокрутки под шапкой
// (мобильные), заголовки секций опускаются: на узком экране место
// дороже группировки. isMaster фильтрует masterOnly-пункты (Ж6в)
// в обоих вариантах — обязательный проп: забыть передать нельзя,
// тип не пустит.
export function AdminNav({
  variant = 'sidebar',
  isMaster,
}: {
  variant?: 'sidebar' | 'strip'
  isMaster: boolean
}) {
  const pathname = usePathname()
  const visibleSections = NAV_SECTIONS.map((s) => ({
    ...s,
    items: s.items.filter((i) => !i.masterOnly || isMaster),
  })).filter((s) => s.items.length > 0)

  if (variant === 'strip') {
    return (
      <nav aria-label="Разделы" className="flex items-center gap-1">
        {visibleSections.flatMap((s) => s.items).map((item) => (
          <Link key={item.href} href={item.href} className={itemClasses(isActive(pathname, item.href))}>
            <item.icon className="size-4 shrink-0" />
            {item.label}
          </Link>
        ))}
      </nav>
    )
  }

  return (
    <nav aria-label="Разделы" className="grid gap-5">
      {visibleSections.map((section, si) => (
        <div key={section.title ?? si} className="grid gap-1">
          {section.title && (
            <div className="px-2 pb-0.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {section.title}
            </div>
          )}
          {section.items.map((item) => (
            <Link key={item.href} href={item.href} className={itemClasses(isActive(pathname, item.href))}>
              <item.icon className="size-4 shrink-0" />
              {item.label}
            </Link>
          ))}
        </div>
      ))}
    </nav>
  )
}
