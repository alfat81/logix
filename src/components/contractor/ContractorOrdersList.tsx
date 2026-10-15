'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { CalendarDays, ChevronRight, Loader2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import { readApiResponse } from '@/lib/api-client'
import {
  ORDER_STATUS_LABELS,
  STAGE_STATUS_LABELS,
  type OrderStatus,
  type StageStatus,
} from '@/lib/order-constants'

// Список «своих» заявок портала (Г4). Бейджи — локальные копии
// раскраски кабинета менеджера (OrdersList/admin): ту же палитру
// держим сознательно без общего импорта, чтобы портал подрядчика не
// срастался с кабинетом сотрудников раньше времени (три кабинета —
// три судьбы, роадмап раздел 1).

type MyStage = {
  id: string
  name: string
  status: StageStatus
  plannedDate: string | null
  actualDate: string | null
}

type MyOrder = {
  id: string
  number: string
  status: OrderStatus
  createdAt: string
  stages: MyStage[]
}

const fmtDate = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleDateString('ru-RU') : '—'

export function ContractorOrdersList() {
  const { toast } = useToast()
  const [orders, setOrders] = useState<MyOrder[] | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/contractor/orders')
      const data = await readApiResponse<{ orders?: MyOrder[]; error?: string }>(res)
      if (!res.ok) throw new Error(data.error || 'Ошибка загрузки')
      setOrders(data.orders ?? [])
    } catch (e) {
      toast({
        title: 'Не удалось загрузить заявки',
        description: e instanceof Error ? e.message : '',
        variant: 'destructive',
      })
      setOrders([])
    }
  }, [toast])

  useEffect(() => {
    load()
  }, [load])

  if (orders === null) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground text-sm py-16 justify-center">
        <Loader2 className="size-4 animate-spin" />
        Загрузка…
      </div>
    )
  }

  if (orders.length === 0) {
    return (
      <Card className="p-8 text-center text-muted-foreground">
        Пока нет назначенных вам этапов. Как только менеджер назначит вас на этап
        заявки — она появится здесь.
      </Card>
    )
  }

  return (
    <div className="grid gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Мои заявки</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Заявки, где есть хотя бы один ваш этап. Статусы смотрите внутри.
        </p>
      </div>
      <div className="grid gap-2">
        {orders.map((o) => (
          <Card key={o.id} className="p-0">
            <Link href={`/contractor/orders/${o.id}`}>
              <CardContent className="p-4 flex flex-wrap items-center gap-x-4 gap-y-2 hover:bg-accent/50 transition-colors">
                <span className="font-semibold font-mono text-lg">{o.number}</span>
                <OrderStatusBadge status={o.status} />
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <CalendarDays className="size-3" />
                  создана {fmtDate(o.createdAt)}
                </span>
                <div className="flex flex-wrap items-center gap-1.5 ml-2">
                  {o.stages.map((s) => (
                    <span key={s.id} className="flex items-center gap-1.5">
                      <Badge variant="outline" className="text-xxs font-normal">
                        {s.name}
                      </Badge>
                      <StageStatusBadge status={s.status} />
                    </span>
                  ))}
                </div>
                <ChevronRight className="size-4 text-muted-foreground ml-auto" />
              </CardContent>
            </Link>
          </Card>
        ))}
      </div>
    </div>
  )
}

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const map: Record<OrderStatus, string> = {
    calculating: 'bg-muted text-muted-foreground',
    confirmed: 'bg-info text-info-foreground',
    in_progress: 'bg-warning text-warning-foreground',
    completed: 'bg-success text-success-foreground',
    cancelled: 'bg-destructive text-destructive-foreground',
  }
  return (
    <Badge className={`${map[status]} border-transparent`} variant="outline">
      {ORDER_STATUS_LABELS[status]}
    </Badge>
  )
}

export function StageStatusBadge({ status }: { status: StageStatus }) {
  const map: Record<StageStatus, string> = {
    not_started: 'bg-muted text-muted-foreground',
    in_progress: 'bg-warning text-warning-foreground',
    done: 'bg-success text-success-foreground',
    problem: 'bg-destructive text-destructive-foreground',
  }
  return (
    <Badge variant="outline" className={`${map[status]} border-transparent`}>
      {STAGE_STATUS_LABELS[status]}
    </Badge>
  )
}
