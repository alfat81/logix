import Link from 'next/link'
import { ChevronRight } from 'lucide-react'

// ─── Хлебные крошки (Ж7) ────────────────────────────────────────────
// Чистый компонент без хуков и без 'use client': рендерится и в
// серверных, и в клиентских страницах (карточки заявки/лида —
// клиентские). Последний элемент — текущая страница (без ссылки,
// aria-current="page"), остальные — ссылки.
//
// Осознанный периметр: крошки стоят на ВЛОЖЕННЫХ страницах (карточка
// заявки, карточка лида), где путь глубже одного уровня. Списки
// (Заявки, Лиды, Подрядчики) крошек не получают — их положение уже
// показывает активный пункт меню, дублировать строку «Главная /
// Заявки» над заголовком «Заявки» — шум, а не навигация.

export type BreadcrumbItem = {
  label: string
  // Нет href или это последний элемент — текущая страница, не ссылка.
  href?: string
}

export function Breadcrumbs({ items, className }: { items: BreadcrumbItem[]; className?: string }) {
  return (
    <nav
      aria-label="Хлебные крошки"
      className={`flex items-center gap-1 text-sm min-w-0 ${className ?? ''}`}
    >
      {items.map((item, i) => {
        const isLast = i === items.length - 1
        return (
          <span key={`${item.label}-${i}`} className="flex items-center gap-1 min-w-0">
            {i > 0 && <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/60" />}
            {item.href && !isLast ? (
              <Link
                href={item.href}
                className="text-muted-foreground transition-colors hover:text-foreground truncate"
              >
                {item.label}
              </Link>
            ) : (
              <span
                aria-current={isLast ? 'page' : undefined}
                className={
                  isLast
                    ? 'text-foreground font-medium truncate'
                    : 'text-muted-foreground truncate'
                }
              >
                {item.label}
              </span>
            )}
          </span>
        )
      })}
    </nav>
  )
}
