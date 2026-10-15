'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Loader2, Search, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { OrderStatusBadge } from '@/components/admin/OrdersList'
import { LeadStatusBadge } from '@/components/admin/LeadsList'
import { MIN_QUERY_LENGTH } from '@/lib/search-constants'
import type { OrderStatus } from '@/lib/order-constants'
import type { LeadStatus } from '@/lib/leads'

// ─── Глобальный поиск в шапке (Ж7) ──────────────────────────────────
// Typeahead по заявкам и лидам: дебаунс (паттерн Ж4), страж гонок
// reqId, закрытие по Esc/клику мимо, Enter — переход к первому
// результату. Ссылки в дропдауне — обычные <Link>, навигация работает
// и с клавиатуры (Tab + Enter). Результат — только переход: правки
// из поиска не делаются, у каждой сущности своя карточка.

type SearchResults = {
  orders: { id: string; number: string; status: OrderStatus; customerName: string }[]
  leads: { id: string; status: LeadStatus; createdAt: string; contactName: string }[]
}

const EMPTY: SearchResults = { orders: [], leads: [] }

const fmtDate = (iso: string): string => new Date(iso).toLocaleDateString('ru-RU')

export function GlobalSearch() {
  const router = useRouter()

  const [q, setQ] = useState('')
  const debouncedQ = useDebouncedValue(q.trim(), 300)
  const [results, setResults] = useState<SearchResults>(EMPTY)
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  // Страж гонок (Ж4): быстрая печать рождает запросы быстрее ответов —
  // применяем только последний.
  const reqId = useRef(0)
  // Клик мимо: слушатель на document, дропдаун закрывается, если
  // нажатие пришло вне контейнера поиска.
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (debouncedQ.length < MIN_QUERY_LENGTH) {
      setResults(EMPTY)
      setLoading(false)
      return
    }

    const id = ++reqId.current
    setLoading(true)
    fetch(`/api/admin/search?q=${encodeURIComponent(debouncedQ)}`)
      .then(async (res) => {
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Ошибка поиска')
        return data as SearchResults
      })
      .then((data) => {
        if (id !== reqId.current) return
        setResults(data)
      })
      .catch(() => {
        if (id !== reqId.current) return
        // Поиск в шапке не должен забрасывать тостами (набор продолжится
        // и повторится на следующем символе) — тихий отказ, статус виден
        // по пустому дропдауну.
        setResults(EMPTY)
      })
      .finally(() => {
        if (id === reqId.current) setLoading(false)
      })
  }, [debouncedQ])

  // Клик мимо и Esc — закрыть дропдаун, не трогая запрос (фокус в
  // поле остаётся, продолжение печати снова откроет панель).
  useEffect(() => {
    const onPointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [])

  const trimmed = q.trim()
  const showDropdown = open && trimmed.length > 0
  const hasAny = results.orders.length > 0 || results.leads.length > 0

  // Enter — быстрый переход к первому результату (привычный жест
  // «напечатал → Enter → в карточке»).
  const goFirst = () => {
    const first =
      results.orders[0] !== undefined
        ? `/admin/orders/${results.orders[0].id}`
        : results.leads[0] !== undefined
          ? `/admin/leads/${results.leads[0].id}`
          : null
    if (!first) return
    setOpen(false)
    setQ('')
    router.push(first)
  }

  const navigate = () => {
    setOpen(false)
    setQ('')
  }

  return (
    <div ref={rootRef} className="relative min-w-0 flex-1 max-w-sm">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        className="pr-8 pl-8"
        placeholder="Поиск: номер, клиент, телефон…"
        aria-label="Глобальный поиск по заявкам и лидам"
        value={q}
        onChange={(e) => {
          setQ(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') goFirst()
        }}
      />
      {q && (
        <button
          type="button"
          aria-label="Очистить поиск"
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
          onClick={() => {
            setQ('')
            setResults(EMPTY)
          }}
        >
          <X className="size-4" />
        </button>
      )}

      {showDropdown && (
        <div className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md">
          {loading ? (
            <div className="flex items-center gap-2 px-3 py-3 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Ищем…
            </div>
          ) : !hasAny ? (
            <div className="px-3 py-3 text-sm text-muted-foreground">
              {trimmed.length < MIN_QUERY_LENGTH
                ? `Введите минимум ${MIN_QUERY_LENGTH} символа`
                : `Ничего не найдено по «${trimmed}»`}
            </div>
          ) : (
            <div className="max-h-96 overflow-y-auto py-1">
              {results.orders.length > 0 && (
                <>
                  <div className="px-3 py-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Заявки
                  </div>
                  {results.orders.map((o) => (
                    <Link
                      key={o.id}
                      href={`/admin/orders/${o.id}`}
                      onClick={navigate}
                      className="flex items-center justify-between gap-3 px-3 py-1.5 text-sm transition-colors hover:bg-accent"
                    >
                      <span className="flex min-w-0 items-baseline gap-2">
                        <span className="font-mono font-semibold">{o.number}</span>
                        <span className="truncate text-muted-foreground">{o.customerName}</span>
                      </span>
                      <OrderStatusBadge status={o.status} />
                    </Link>
                  ))}
                </>
              )}
              {results.leads.length > 0 && (
                <>
                  <div className="mt-1 px-3 py-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Лиды
                  </div>
                  {results.leads.map((l) => (
                    <Link
                      key={l.id}
                      href={`/admin/leads/${l.id}`}
                      onClick={navigate}
                      className="flex items-center justify-between gap-3 px-3 py-1.5 text-sm transition-colors hover:bg-accent"
                    >
                      <span className="flex min-w-0 items-baseline gap-2">
                        <span className="truncate font-medium">{l.contactName || 'Без контакта'}</span>
                        <span className="shrink-0 text-muted-foreground">{fmtDate(l.createdAt)}</span>
                      </span>
                      <LeadStatusBadge status={l.status} />
                    </Link>
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
