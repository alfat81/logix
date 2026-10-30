'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Activity,
  BookOpen,
  Building2,
  ClipboardList,
  FileSignature,
  Home,
  Inbox,
  Landmark,
  ListChecks,
  Mail,
  Settings,
  Truck,
  UserCog,
  Users,
  type LucideIcon,
} from 'lucide-react'

// ─── Меню кабинета (Ж7) ─────────────────────────────────────────────
// Клиентский компонент ради usePathname (активный пункт) — layout
// остаётся серверным и просто рендерит <AdminNav isMaster={…}/>
// (v0.3.1 §4.1: и счётчики считает тоже layout — один серверный
// запрос на пункт за рендер кабинета).
//
// v0.3.1 (BRANDBOOK §4.1, макет D24): у пункта — счётчик активных
// объектов: таблетка Coral с белым числом, tabular-nums; активный
// пункт — плашка White (radius-sm), иконка и текст Coral, Medium.
// Счётчики — только у сделочных разделов (Заявки/Лиды): там число
// реально призыв к действию; в справочниках оно шум.

type NavItem = {
  href: string
  label: string
  icon: LucideIcon
  // Ж6в / DF-00D: пункт виден только мастеру (Сотрудники, Настройки).
  masterOnly?: boolean
  // §4.1: число активных объектов (приходит из layout, сервер).
  count?: number
}

type NavSection = {
  // null — секция без заголовка (верхний одиночный пункт «Главная»).
  title: string | null
  items: NavItem[]
}

// Счётчики навигации §4.1: числа активных сделок; layout заполняет
// по ролям. Ключи — href разделов: конфиг меню остаётся единственным
// местом знания о маршрутах.
export type NavCounts = Partial<Record<'/admin/orders' | '/admin/leads', number>>

const NAV_SECTIONS: NavSection[] = [
  {
    title: null,
    items: [
      // DF-07: «Пульс» — первый пункт МАСТЕРА (вход мастера открывает
      // его же — редирект после логина); менеджеру сводка всего дела
      // не показана (API отдаёт 403, страница ведёт на главную).
      { href: '/admin/pulse', label: 'Пульс', icon: Activity, masterOnly: true },
      { href: '/admin', label: 'Главная', icon: Home },
    ],
  },
  {
    title: 'Сделки',
    items: [
      { href: '/admin/orders', label: 'Заявки', icon: ClipboardList },
      { href: '/admin/leads', label: 'Запросы', icon: Inbox },
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
      // DF-17: страны/валюты/упаковка/условия поставки — источник выбора
      // для всех форм (мастер и менеджер, правки write:true)
      { href: '/admin/references', label: 'Справочники', icon: BookOpen },
    ],
  },
  {
    title: null,
    items: [
      // DF-04: журнал отправок — инструмент мастера (очередь писем со
      // всеми сторонами сделки); меню и раздел master-only (Ж6в).
      { href: '/admin/notifications', label: 'Журнал отправок', icon: Mail, masterOnly: true },
      { href: '/admin/settings', label: 'Настройки', icon: Settings, masterOnly: true },
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
    'relative flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm transition-colors whitespace-nowrap'
  // §4.1 (v1.3, DF-20): активный — плашка White (bg-card на Sand-панели,
  // radius-sm), текст Ink, слева полоска 3px Action-icon; иконка —
  // Action-icon (красится на элементе иконки в render). Coral-текст
  // пункта меню запрещён (красный сигнал — только срочное).
  return active
    ? `${base} bg-card text-foreground font-medium before:content-[''] before:absolute before:left-0 before:top-1/2 before:h-5 before:w-[3px] before:-translate-y-1/2 before:rounded-full before:bg-action-icon`
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
  counts,
}: {
  variant?: 'sidebar' | 'strip'
  isMaster: boolean
  // §4.1: счётчики активных объектов — приходит из серверного layout;
  // в мобильном strip-варианте не рисуются (место дороже — Ж5).
  counts?: NavCounts
}) {
  const pathname = usePathname()
  const withCounts = variant === 'sidebar' && counts !== undefined
  const visibleSections = NAV_SECTIONS.map((s) => ({
    ...s,
    items: s.items
      .filter((i) => !i.masterOnly || isMaster)
      .map((i) => ({ ...i, count: withCounts ? counts?.[i.href as keyof NavCounts] : undefined })),
  })).filter((s) => s.items.length > 0)

  if (variant === 'strip') {
    return (
      <nav aria-label="Разделы" className="flex items-center gap-1">
        {visibleSections.flatMap((s) => s.items).map((item) => {
          const active = isActive(pathname, item.href)
          return (
            <Link key={item.href} href={item.href} className={itemClasses(active)}>
              <item.icon className={active ? 'size-4 shrink-0 text-action-icon' : 'size-4 shrink-0'} />
              {item.label}
            </Link>
          )
        })}
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
          {section.items.map((item) => {
            const active = isActive(pathname, item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={itemClasses(active)}
                aria-current={active ? 'page' : undefined}
              >
                <item.icon className={active ? 'size-4 shrink-0 text-action-icon' : 'size-4 shrink-0'} />
                {item.label}
                {item.count !== undefined && (
                  // §4.1: таблетка Coral с числом Ink (v1.3 — 6,09), tabular-nums.
                  <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-medium tabular-nums text-primary-foreground">
                    {item.count}
                  </span>
                )}
              </Link>
            )
          })}
        </div>
      ))}
    </nav>
  )
}
