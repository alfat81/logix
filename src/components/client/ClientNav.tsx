'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

// TU-01.7 (волна 3): навигация топбара кабинета клиента (референс
// clientcabinet.png — ОБЗОР / МОИ ЗАЯВКИ / МОИ ЗАЯВКИ-ЗАПРОСЫ).
// Разделы — якоря Обзора (карта TU-01.1: 4 страницы, отдельных
// списков нет — реестр отклонений), активный пункт — Обзор.
const NAV = [
  { href: '/client', label: 'Обзор', exact: true },
  { href: '/client#orders', label: 'Мои заявки', exact: false },
  { href: '/client#requests', label: 'Мои запросы', exact: false },
] as const

export function ClientNav() {
  const pathname = usePathname()

  return (
    <nav aria-label="Разделы кабинета" className="hidden md:flex items-center gap-6">
      {NAV.map((item) => {
        const active = item.exact && pathname === '/client'
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`text-xs font-semibold uppercase tracking-widest transition-colors hover:text-foreground ${
              active ? 'text-foreground' : 'text-muted-foreground'
            }`}
          >
            <span className={active ? 'border-b-2 border-accent-strong pb-3' : 'pb-3'}>
              {item.label}
            </span>
          </Link>
        )
      })}
    </nav>
  )
}
