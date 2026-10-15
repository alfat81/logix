'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ChevronRight, Loader2, Search, UserPlus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { formatPhoneInput } from '@/lib/phone'

// ─── Список клиентов (Ж6а) — эталонный паттерн Ж4 ──────────────
// Поиск ?q= (имя, телефон с вариантами набора, email, комментарий),
// сортировка, «Показать ещё», счётчик найденного. Строка ведёт в
// карточку клиента: договоры, заявки, лиды.

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

  const [createOpen, setCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [comment, setComment] = useState('')

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

  const handleCreate = async () => {
    if (!name.trim()) {
      toast({ title: 'Укажите имя клиента', variant: 'destructive' })
      return
    }
    setCreating(true)
    try {
      const res = await fetch('/api/admin/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          phone: phone || null,
          email: email.trim() || null,
          comment: comment.trim() || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Не удалось создать клиента')

      toast({ title: `Клиент «${data.customer.name}» создан` })
      setCreateOpen(false)
      setName('')
      setPhone('')
      setEmail('')
      setComment('')
      setVersion((v) => v + 1)
    } catch (e) {
      toast({
        title: 'Ошибка создания',
        description: e instanceof Error ? e.message : '',
        variant: 'destructive',
      })
    } finally {
      setCreating(false)
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
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <UserPlus className="size-4" />
              Новый клиент
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Новый клиент</DialogTitle>
              <DialogDescription>
                Завести заранее — например, перед первым обращением. Клиент
                также рождается сам при создании заявки или конвертации лида.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="cust-name">Имя или название</Label>
                <Input
                  id="cust-name"
                  placeholder="ООО «Ромашка» или Иван"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="cust-phone">Телефон</Label>
                <Input
                  id="cust-phone"
                  type="tel"
                  placeholder="+7 (…) — не обязателен"
                  value={phone}
                  onChange={(e) => setPhone(formatPhoneInput(e.target.value))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="cust-email">Email</Label>
                <Input
                  id="cust-email"
                  type="email"
                  placeholder="не обязателен"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="cust-comment">Комментарий</Label>
                <Textarea
                  id="cust-comment"
                  placeholder="Например: возит из Китая, платит вовремя"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleCreate} disabled={creating}>
                {creating && <Loader2 className="size-4 animate-spin" />}
                Создать
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
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
              <Card className="p-4 flex flex-wrap items-center gap-x-6 gap-y-1 transition-colors group-hover:border-ring">
                <div className="min-w-48 flex-1">
                  <div className="font-medium truncate">{c.name}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {[c.phone, c.email].filter(Boolean).join(' · ') || 'Контактов нет'}
                  </div>
                </div>
                <div className="flex items-center gap-4 text-sm text-muted-foreground tabular-nums">
                  <span>
                    Заявки: <span className="text-foreground">{c.ordersCount}</span>
                  </span>
                  <span>
                    Договоры: <span className="text-foreground">{c.contractsCount}</span>
                  </span>
                  <span>
                    Лиды: <span className="text-foreground">{c.leadsCount}</span>
                  </span>
                </div>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
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
