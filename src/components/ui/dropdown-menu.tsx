'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

// ─── Dropdown-меню (DF-26: «Скачать ▾» реестра) ──────────────────────
// Без новых зависимостей (RULES): минимальный примитив на useState с
// закрытием по клику вне и Escape; Radix-пакета dropdown-menu в проекте
// нет, а диалог для трёх пунктов избыточен. API повторяет shadcn
// (DropdownMenu/Trigger/Content/Item) — замена на Radix без изменений
// вызывающих мест, если появится зависимость.

export function DropdownMenu({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false)
  const ref = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (!open) return
    const onPointer = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <DropdownContext.Provider value={{ open, setOpen }}>
      <div ref={ref} className="relative inline-block">
        {children}
      </div>
    </DropdownContext.Provider>
  )
}

const DropdownContext = React.createContext<{ open: boolean; setOpen: (v: boolean) => void }>({
  open: false,
  setOpen: () => {},
})

export function DropdownMenuTrigger({
  asChild,
  children,
}: {
  asChild?: boolean
  children: React.ReactElement
}) {
  const ctx = React.useContext(DropdownContext)
  if (asChild) {
    const child = children as React.ReactElement<{
      onClick?: (e: React.MouseEvent) => void
      'aria-expanded'?: boolean
      'aria-haspopup'?: 'menu'
    }>
    return React.cloneElement(child, {
      onClick: (e: React.MouseEvent) => {
        child.props.onClick?.(e)
        ctx.setOpen(!ctx.open)
      },
      'aria-expanded': ctx.open,
      'aria-haspopup': 'menu',
    })
  }
  return (
    <button type="button" onClick={() => ctx.setOpen(!ctx.open)} aria-expanded={ctx.open}>
      {children}
    </button>
  )
}

export function DropdownMenuContent({
  children,
  align = 'start',
  className,
}: {
  children: React.ReactNode
  align?: 'start' | 'end'
  className?: string
}) {
  const ctx = React.useContext(DropdownContext)
  if (!ctx.open) return null
  return (
    <div
      role="menu"
      className={cn(
        'absolute z-50 min-w-56 overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md',
        align === 'end' ? 'right-0' : 'left-0',
        className,
      )}
    >
      {children}
    </div>
  )
}

export function DropdownMenuItem({
  children,
  onClick,
  disabled,
  className,
}: {
  children: React.ReactNode
  onClick?: () => void
  disabled?: boolean
  className?: string
}) {
  const ctx = React.useContext(DropdownContext)
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={() => {
        onClick?.()
        ctx.setOpen(false)
      }}
      className={cn(
        'relative flex w-full cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-left',
        'focus-visible:outline-none hover:bg-muted/60 disabled:pointer-events-none disabled:opacity-50',
        className,
      )}
    >
      {children}
    </button>
  )
}
