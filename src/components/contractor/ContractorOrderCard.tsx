'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, CalendarDays, CheckCircle2, CircleDashed, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import { readApiResponse } from '@/lib/api-client'
import { OrderStatusBadge, StageStatusBadge } from '@/components/contractor/ContractorOrdersList'
import {
  ORDER_STATUS_LABELS,
  STAGE_STATUS_LABELS,
  type OrderStatus,
  type StageStatus,
} from '@/lib/order-constants'

// Урезанная карточка заявки портала (Г4): номер, статус заявки, ВСЕ
// этапы цепочки (контекст: что до и после участка подрядчика), свои —
// помечены «Ваш этап» и имеют кнопки статуса. Никаких клиентов,
// договоров, сумм и правки заявки — это кабинет соисполнителя, а не
// менеджера (роадмап, раздел 1: «обновляет статус своего этапа»).

type PortalStage = {
  id: string
  name: string
  sequence: number
  status: StageStatus
  plannedDate: string | null
  actualDate: string | null
  isMine: boolean
}

type PortalOrder = {
  id: string
  number: string
  status: OrderStatus
  createdAt: string
  stages: PortalStage[]
}

// Ровно те статусы, что разрешены сервером (Г4): откат в «Не начат» —
// прерогатива менеджера, кнопки «Не начат» в портале нет осознанно.
const MY_STATUSES: StageStatus[] = ['in_progress', 'done', 'problem']

const fmtDate = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleDateString('ru-RU') : '—'

export function ContractorOrderCard() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { toast } = useToast()
  const [order, setOrder] = useState<PortalOrder | null>(null)
  const [loading, setLoading] = useState(true)
  const [busyStageId, setBusyStageId] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/contractor/orders/${id}`)
      if (res.status === 404) {
        toast({ title: 'Заявка не найдена', variant: 'destructive' })
        router.replace('/contractor')
        return
      }
      const data = await readApiResponse<{ order?: PortalOrder; error?: string }>(res)
      if (!res.ok) throw new Error(data.error || 'Ошибка загрузки')
      setOrder(data.order ?? null)
    } catch (e) {
      toast({
        title: 'Не удалось загрузить заявку',
        description: e instanceof Error ? e.message : '',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }, [id, router, toast])

  useEffect(() => {
    load()
  }, [load])

  if (loading || !order) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground text-sm py-16 justify-center">
        <Loader2 className="size-4 animate-spin" />
        Загрузка…
      </div>
    )
  }

  const patchStage = async (stageId: string, status: StageStatus) => {
    setBusyStageId(stageId)
    try {
      const res = await fetch(`/api/contractor/orders/${id}/stages/${stageId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      const data = await readApiResponse<{ message?: string; error?: string }>(res)
      if (!res.ok) {
        toast({ title: data.error || 'Ошибка', variant: 'destructive' })
        return
      }
      toast({ title: data.message || 'Этап обновлён' })
      load()
    } catch {
      toast({ title: 'Сеть недоступна', variant: 'destructive' })
    } finally {
      setBusyStageId(null)
    }
  }

  const myDone = order.stages.filter((s) => s.isMine && s.status === 'done').length
  const myTotal = order.stages.filter((s) => s.isMine).length

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/contractor">
            <ArrowLeft className="size-4" />
            Мои заявки
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight font-mono">{order.number}</h1>
        <OrderStatusBadge status={order.status} />
        <span className="text-sm text-muted-foreground ml-auto">
          {ORDER_STATUS_LABELS[order.status]} · ваших этапов: {myDone}/{myTotal}
        </span>
      </div>

      <div className="grid gap-2">
        {[...order.stages]
          .sort((a, b) => a.sequence - b.sequence)
          .map((s) => (
            <Card
              key={s.id}
              className={
                s.isMine
                  ? 'p-4 border-l-4 border-l-primary/70'
                  : 'p-4 border-l-4 border-l-transparent opacity-80'
              }
            >
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold tabular-nums">
                  {s.sequence}
                </div>
                <div className="min-w-44 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{s.name}</span>
                    {s.isMine ? (
                      <Badge variant="outline" className="gap-1 text-xxs">
                        <CircleDashed className="size-3" />
                        ваш этап
                      </Badge>
                    ) : null}
                  </div>
                  <div className="text-xs text-muted-foreground flex items-center gap-3 mt-0.5">
                    <span className="flex items-center gap-1">
                      <CalendarDays className="size-3" />
                      план: {fmtDate(s.plannedDate)}
                    </span>
                    <span className="flex items-center gap-1">
                      <CheckCircle2 className="size-3" />
                      факт: {fmtDate(s.actualDate)}
                    </span>
                  </div>
                </div>

                <StageStatusBadge status={s.status} />

                {/* Кнопки — только на своих этапах; «Не начат»
                    сознательно отсутствует (откат — к менеджеру) */}
                {s.isMine && (
                  <div className="flex items-center gap-1">
                    {MY_STATUSES.filter((st) => st !== s.status).map((st) => (
                      <Button
                        key={st}
                        variant={st === 'problem' ? 'destructive' : 'outline'}
                        size="sm"
                        disabled={busyStageId === s.id}
                        onClick={() => patchStage(s.id, st)}
                      >
                        {busyStageId === s.id && <Loader2 className="size-4 animate-spin" />}
                        {STAGE_STATUS_LABELS[st]}
                      </Button>
                    ))}
                  </div>
                )}
              </div>
            </Card>
          ))}
      </div>
    </div>
  )
}
