'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Loader2, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { CustomerCreateDialog } from '@/components/admin/CustomerCreateDialog'

// ─── Список клиентов (Ж6а) — эталонный паттерн Ж4 ──────────────
// Поиск ?q= (имя, телефон с вариантами набора, email, комментарий),
// сортировка, «Показать ещё», счётчик найденного. Строка ведёт в
// карточку клиента: договоры, заявки, лиды.
// v0.4.0 (BRANDBOOK §4.3): карточка — анатомия заявки без степпера
// (по аналогии, решение владельца): строка 1 — дата (tabular,
// приглушённая; номера у клиента нет), строка 2 — имя Bold,
// строка 3 — контакты приглушённая; правый блок — счётчики сделок
// (заявки — как ETA-блок, договоры/лиды — caption). Диалог создания —
// CustomerCreateDialog (резка под лимит 300, RULES 2.14).

const PAGE_TAKE = 20

type CustomerRow = {
  id: string
  name: string
  phone: string | null
  email: string | null
  comment: string | null
  isActive: boolean
  createdAt: string
  ordersCount: number
  contractsCount: number
  leadsCount: number
}

type CustomersPage = { customers: CustomerRow[]; hasMore: boolean; counts: { all: number } }

const fmtDate = (iso: string): string => new Date(iso).toLocaleDateString('ru-RU')

export function CustomersList() {
  const { toast } = useToast()

  const [customers, setCustomers] = useState<CustomerRow[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [total, setTotal] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [sort, setSort] = useState('name_asc')
  const [q, setQ] = useState('')
  const debouncedQ = useDebouncedValue(q, 400)
  // Версия: сброс списка после создания клиента без копирования
  // load-логики в обработчик (паттерн OrdersList).
  const [version, setVersion] = useState(0)
  // Страж гонок: применяем только последний ответ.
  const reqId = useRef(0)

  // take шлём ВСЕГДА: роут различает список и легаси-справочник для
  // диалога создания заявки по наличию параметров (см. комментарий
  // GET /api/admin/customers) — список обязан остаться списком.
  const fetchPage = useCallback(
    async (skip: number): Promise<CustomersPage> => {
      const params = new URLSearchParams()
      params.set('take', String(PAGE_TAKE))
      if (debouncedQ) params.set('q', debouncedQ)
      if (sort !== 'name_asc') params.set('sort', sort)
      if (skip) params.set('skip', String(skip))
      const res = await fetch(`/api/admin/customers?${params.toString()}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Ошибка загрузки')
      return data
    },
    [debouncedQ, sort]
  )

  useEffect(() => {
    const id = ++reqId.current
    setLoading(true)
    fetchPage(0)
      .then((data) => {
        if (id !== reqId.current) return
        setCustomers(data.customers)
        setHasMore(data.hasMore)
        setTotal(data.counts.all)
      })
      .catch((e) => {
        if (id !== reqId.current) return
        toast({
          title: 'Не удалось загрузить клиентов',
          description: e instanceof Error ? e.message : '',
          variant: 'destructive',
        })
      })
      .finally(() => {
        if (id === reqId.current) setLoading(false)
      })
  }, [fetchPage, version, toast])

  const loadMore = async () => {
    if (loadingMore) return
    setLoadingMore(true)
    try {
      const data = await fetchPage(customers.length)
      setCustomers((prev) => [...prev, ...data.customers])
      setHasMore(data.hasMore)
    } catch (e) {
      toast({
        title: 'Не удалось загрузить клиентов',
        description: e instanceof Error ? e.message : '',
        variant: 'destructive',
      })
    } finally {
      setLoadingMore(false)
    }
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Клиенты</h1>
          <p className="text-sm text-muted-foreground">
            Поиск по имени, телефону, email и комментарию
            {total !== null ? ` · всего: ${total}` : ''}
          </p>
        </div>
        <CustomerCreateDialog onCreated={() => setVersion((v) => v + 1)} />
      </div>

      {/* Паттерн Ж4: поиск с крестиком + сортировка */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pr-8 pl-8"
            placeholder="Имя, телефон, email, комментарий…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          {q && (
            <button
              type="button"
              aria-label="Очистить поиск"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
              onClick={() => setQ('')}
            >
              <X className="size-4" />
            </button>
          )}
        </div>
        <Select value={sort} onValueChange={setSort}>
          <SelectTrigger className="w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="name_asc">Имя А-Я</SelectItem>
            <SelectItem value="name_desc">Имя Я-А</SelectItem>
            <SelectItem value="newest">Сначала новые</SelectItem>
            <SelectItem value="oldest">Сначала старые</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm py-8 justify-center">
          <Loader2 className="size-4 animate-spin" />
          Загрузка…
        </div>
      ) : customers.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground text-sm">
          {q ? `Ничего не найдено по «${q}».` : 'Клиентов пока нет — заведите первого.'}
        </Card>
      ) : (
        <div className="grid gap-2">
          {customers.map((c) => (
            <Link key={c.id} href={`/admin/customers/${c.id}`} className="block group">
              <Card className="p-4 transition-colors group-hover:border-ring">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-muted-foreground text-sm tabular-nums">
                      с {fmtDate(c.createdAt)}
                    </div>
                    <div className="truncate font-semibold">{c.name}</div>
                    <div className="truncate text-sm text-muted-foreground">
                      {[c.phone, c.email].filter(Boolean).join(' · ') || 'Контактов нет'}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-sm font-semibold tabular-nums">
                      Заявок: {c.ordersCount}
                    </div>
                    <div className="text-muted-foreground text-xs tabular-nums">
                      Договоры: {c.contractsCount} · Запросы: {c.leadsCount}
                    </div>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
          {hasMore && (
            <Button variant="outline" onClick={loadMore} disabled={loadingMore}>
              {loadingMore && <Loader2 className="size-4 animate-spin" />}
              Показать ещё
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
