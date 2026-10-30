'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { NAV_SECTIONS, type NavItem } from '@/components/admin/nav-config'

// ─── Меню кабинета (Ж7) ─────────────────────────────────────────────
// Клиентский компонент ради usePathname (активный пункт) — layout
// остаётся серверным и просто рендерит <AdminNav isMaster={…}/>
// (v0.3.1 §4.1: и счётчики считает тоже layout — один серверный
// запрос на пункт за рендер кабинета).
//
// v0.3.1 (BRANDBOOK §4.1, макет D24): у пункта — счётчик активных
// объектов: таблетка Coral с белым числом, tabular-nums; активный
// пункт — плашка White (radius-sm), иконка и текст Coral, Medium.
// Счётчики — только у сделочных разделов (Заявки/Запросы): там число
// реально призыв к действию; в справочниках оно шум.
//
// DF-21: состав меню живёт в nav-config.ts (единый источник с нижней
// панелью телефона AdminBottomNav — рассинхрон невозможен); прежний
// горизонтальный strip-вариант заменён нижней навигацией (BRANDBOOK
// §4.5 «Телефон 375px»). Счётчик бейджа помечен data-nav-badge —
// e2e сверяет его с суммой активных табов API (один источник).

// Счётчики навигации §4.1: числа активных сделок; layout заполняет
// по ролям. Ключи — href разделов: конфиг меню остаётся единственным
// местом знания о маршрутах.
export type NavCounts = Partial<Record<'/admin/orders' | '/admin/leads', number>>

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

// Вертикальное меню с заголовками секций (md+). isMaster фильтрует
// masterOnly-пункты (Ж6в) — обязательный проп: забыть передать нельзя,
// тип не пустит.
export function AdminNav({
  isMaster,
  counts,
}: {
  isMaster: boolean
  // §4.1: счётчики активных объектов — приходит из серверного layout.
  counts?: NavCounts
}) {
  const pathname = usePathname()
  const withCounts = counts !== undefined
  const visibleSections = NAV_SECTIONS.map((s) => ({
    ...s,
    items: s.items
      .filter((i: NavItem) => !i.masterOnly || isMaster)
      .map((i) => ({ ...i, count: withCounts ? counts?.[i.href as keyof NavCounts] : undefined })),
  })).filter((s) => s.items.length > 0)

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
                  // data-nav-badge — локатор e2e DF-21 (сверка с табами API).
                  <span
                    data-nav-badge={item.href}
                    className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-medium tabular-nums text-primary-foreground"
                  >
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
