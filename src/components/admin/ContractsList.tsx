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

// ─── Список рамочных договоров (Ж6а) — паттерн Ж4 ──────────────
// Поиск по номеру (точное совпадение — номер набирают целиком),
// клиенту и юрлицу; сортировка; «Показать ещё». Создания вручную
// нет: договор рождается автоматически при первой заявке пары
// клиент+юрлицо (роадмап 8.2). Клиент в строке — ссылка на карточку.

const PAGE_TAKE = 20

type ContractRow = {
  id: string
  number: number
  signedAt: string | null
  createdAt: string
  customer: { id: string; name: string; phone: string | null }
  legalEntity: { id: string; name: string }
  ordersCount: number
}

type ContractsPage = { contracts: ContractRow[]; hasMore: boolean; counts: { all: number } }

export function ContractsList() {
  const { toast } = useToast()

  const [contracts, setContracts] = useState<ContractRow[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [total, setTotal] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [sort, setSort] = useState('number_asc')
  const [q, setQ] = useState('')
  const debouncedQ = useDebouncedValue(q, 400)
  const reqId = useRef(0)

  const fetchPage = useCallback(
    async (skip: number): Promise<ContractsPage> => {
      const params = new URLSearchParams()
      params.set('take', String(PAGE_TAKE))
      if (debouncedQ) params.set('q', debouncedQ)
      if (sort !== 'number_asc') params.set('sort', sort)
      if (skip) params.set('skip', String(skip))
      const res = await fetch(`/api/admin/contracts?${params.toString()}`)
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
        setContracts(data.contracts)
        setHasMore(data.hasMore)
        setTotal(data.counts.all)
      })
      .catch((e) => {
        if (id !== reqId.current) return
        toast({
          title: 'Не удалось загрузить договоры',
          description: e instanceof Error ? e.message : '',
          variant: 'destructive',
        })
      })
      .finally(() => {
        if (id === reqId.current) setLoading(false)
      })
  }, [fetchPage, toast])

  const loadMore = async () => {
    if (loadingMore) return
    setLoadingMore(true)
    try {
      const data = await fetchPage(contracts.length)
      setContracts((prev) => [...prev, ...data.contracts])
      setHasMore(data.hasMore)
    } catch (e) {
      toast({
        title: 'Не удалось загрузить договоры',
        description: e instanceof Error ? e.message : '',
        variant: 'destructive',
      })
    } finally {
      setLoadingMore(false)
    }
  }

  return (
    <div className="grid gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Договоры</h1>
        <p className="text-sm text-muted-foreground">
          Рамочные договоры — по одному на пару «клиент + юрлицо», создаются
          автоматически при первой заявке
          {total !== null ? ` · всего: ${total}` : ''}
        </p>
      </div>

      {/* Паттерн Ж4: поиск с крестиком + сортировка */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pr-8 pl-8"
            placeholder="Номер, клиент, юрлицо…"
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
            <SelectItem value="number_asc">№ по возрастанию</SelectItem>
            <SelectItem value="number_desc">№ по убыванию</SelectItem>
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
      ) : contracts.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground text-sm">
          {q ? `Ничего не найдено по «${q}».` : 'Договоров пока нет — первый появится вместе с первой заявкой.'}
        </Card>
      ) : (
        <div className="grid gap-2">
          {contracts.map((c) => (
            <Card key={c.id} className="p-4 flex flex-wrap items-center gap-x-6 gap-y-1">
              <div className="font-mono font-semibold text-lg min-w-20">№{c.number}</div>
              <div className="min-w-40 flex-1">
                <Link
                  href={`/admin/customers/${c.customer.id}`}
                  className="text-sm font-medium truncate hover:underline"
                >
                  {c.customer.name}
                </Link>
                <div className="text-xs text-muted-foreground truncate">
                  {c.legalEntity.name} ·{' '}
                  {c.signedAt
                    ? `подписан ${new Date(c.signedAt).toLocaleDateString('ru-RU')}`
                    : 'ещё не подписан'}
                </div>
              </div>
              <div className="text-sm text-muted-foreground tabular-nums">
                Заявок: <span className="text-foreground">{c.ordersCount}</span>
              </div>
            </Card>
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
