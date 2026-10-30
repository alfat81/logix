'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { visibleNavItems } from '@/components/admin/nav-config'

// ─── Нижняя панель навигации телефона (DF-21, BRANDBOOK §4.5) ───────
// ≤768px: фиксированная нижняя панель вместо прежней горизонтальной
// полосы под шапкой (v0.7.1 расхождение «нет нижней навигации 64px»).
// Состав — ТОТ ЖЕ nav-config, что у сайдбара (один источник, IC-14):
// разделы с иконками, горизонтальная прокрутка на узком экране.
// Цели касания ≥44px (h-14), счётчиков нет — на телефоне место дороже
// (§4.5); активный пункт — плашка White, иконка Action-icon.
//
// Layout добавляет нижний отступ контенту (pb-16), чтобы панель не
// накрывала последний элемент страницы.
export function AdminBottomNav({ isMaster }: { isMaster: boolean }) {
  const pathname = usePathname()
  const items = visibleNavItems(isMaster)
  return (
    <nav
      aria-label="Разделы"
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-card md:hidden"
    >
      <div className="flex items-stretch gap-1 overflow-x-auto px-1 py-1">
        {items.map((item) => {
          const active = item.href === '/admin' ? pathname === '/admin' : pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={`flex h-12 min-w-16 shrink-0 flex-col items-center justify-center gap-0.5 rounded-sm px-2 text-xs leading-none transition-colors ${
                active
                  ? 'bg-card text-foreground font-medium shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <item.icon
                className={`size-4 shrink-0 ${active ? 'text-action-icon' : ''}`}
                aria-hidden
              />
              <span className="max-w-20 truncate">{item.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
