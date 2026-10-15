'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  AlertTriangle,
  AlertOctagon,
  CheckCircle2,
  Loader2,
  PauseCircle,
  UserX,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import { readApiResponse } from '@/lib/api-client'
import { LEAD_STATUS_LABELS, type LeadStatus } from '@/lib/leads'
import { ORDER_STATUS_LABELS, type OrderStatus } from '@/lib/order-constants'

// ─── Экран «Требует внимания» (Ж5) ─────────────────────────────
// Главная страница кабинета: сводка того, что требует реакции менеджера
// — просрочка, проблемы, неназначенные исполнители, лиды без движения.
// Список заявок переехал на /admin/orders, список лидов — /admin/leads.

type StageAttention = {
  orderId: string
  orderNumber: string
  orderStatus: OrderStatus
  customerName: string
  stageName: string
  stageStatus: string
  plannedDate: string | null
  daysOverdue: number | null
  contractorName: string | null
}

type LeadAttention = {
  leadId: string
  status: LeadStatus
  contactName: string
  daysIdle: number
  updatedAt: string
}

type AttentionData = {
  generatedAt: string
  overdueStages: StageAttention[]
  problemStages: StageAttention[]
  unassignedStages: StageAttention[]
  staleLeads: LeadAttention[]
  counts: { overdue: number; problem: number; unassigned: number; staleLeads: number }
}

const fmtDate = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleDateString('ru-RU') : '—'

// Русская плюрализация дней: 1 день / 2 дня / 5 дней.
function daysWord(n: number): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return 'день'
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'дня'
  return 'дней'
}

export function AttentionScreen() {
  const { toast } = useToast()
  const [data, setData] = useState<AttentionData | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/attention')
      const body = await readApiResponse<AttentionData & { error?: string }>(res)
      if (!res.ok) throw new Error(body.error || 'Ошибка загрузки')
      setData(body)
    } catch (e) {
      toast({
        title: 'Не удалось загрузить сводку',
        description: e instanceof Error ? e.message : '',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    load()
  }, [load])

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground text-sm py-16 justify-center">
        <Loader2 className="size-4 animate-spin" />
        Загрузка…
      </div>
    )
  }

  const counts = data?.counts ?? { overdue: 0, problem: 0, unassigned: 0, staleLeads: 0 }
  const total = counts.overdue + counts.problem + counts.unassigned + counts.staleLeads

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Требует внимания</h1>
        {total > 0 ? (
          <Badge className="bg-destructive text-destructive-foreground border-transparent">
            {total}
          </Badge>
        ) : (
          <Badge className="bg-success text-success-foreground border-transparent">чисто</Badge>
        )}
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="outline" onClick={load}>
            Обновить
          </Button>
        </div>
      </div>
      <p className="text-sm text-muted-foreground -mt-2">
        Просроченные этапы, проблемы, неназначенные исполнители и лиды без движения —
        всё, что ждёт реакции. Список заявок живёт в разделе «Заявки».
      </p>

      {total === 0 ? (
        <Card className="p-8 text-center">
          <CheckCircle2 className="size-8 text-success mx-auto mb-3" />
          <div className="font-medium">Всё под контролем</div>
          <div className="text-sm text-muted-foreground mt-1">
            Ни просрочек, ни проблем, ни зависших лидов. Хорошая работа.
          </div>
          <div className="flex justify-center gap-2 mt-4">
            <Button size="sm" variant="outline" asChild>
              <Link href="/admin/orders">К заявкам</Link>
            </Button>
            <Button size="sm" variant="outline" asChild>
              <Link href="/admin/leads">К лидам</Link>
            </Button>
          </div>
        </Card>
      ) : (
        <>
          <StageSection
            title="Просроченные этапы"
            subtitle="План прошёл, этап не завершён"
            icon={<AlertTriangle className="size-4 text-destructive" />}
            count={counts.overdue}
            rows={data?.overdueStages ?? []}
            tone="destructive"
          />
          <StageSection
            title="Этапы с проблемой"
            subtitle="Статус «Проблема» — требуют разбора"
            icon={<AlertOctagon className="size-4 text-destructive" />}
            count={counts.problem}
            rows={data?.problemStages ?? []}
            tone="destructive"
          />
          <StageSection
            title="Не назначен исполнитель"
            subtitle="Ближайший этап активной заявки ждёт подрядчика"
            icon={<UserX className="size-4 text-warning-foreground" />}
            count={counts.unassigned}
            rows={data?.unassignedStages ?? []}
            tone="warning"
          />
          <StaleLeadsSection
            count={counts.staleLeads}
            rows={data?.staleLeads ?? []}
          />
        </>
      )}
    </div>
  )
}

// ── Секция про этапы заявок (просрочка/проблема/неназначенные) ──

function StageSection({
  title,
  subtitle,
  icon,
  count,
  rows,
  tone,
}: {
  title: string
  subtitle: string
  icon: React.ReactNode
  count: number
  rows: StageAttention[]
  tone: 'destructive' | 'warning'
}) {
  if (count === 0) return null
  const hidden = count - rows.length

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          {icon}
          {title}
          <Badge
            variant="outline"
            className={
              tone === 'destructive'
                ? 'bg-destructive/10 text-destructive border-destructive/30'
                : 'bg-warning/10 text-warning-foreground border-warning/30'
            }
          >
            {count}
          </Badge>
        </CardTitle>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </CardHeader>
      <CardContent className="grid gap-2">
        {rows.map((r, i) => (
          <Link
            key={`${r.orderId}-${r.stageName}-${i}`}
            href={`/admin/orders/${r.orderId}`}
            className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border p-3 transition-colors hover:border-ring"
          >
            <span className="font-mono font-semibold min-w-20">{r.orderNumber}</span>
            <span className="min-w-40 flex-1">
              <span className="font-medium">{r.customerName}</span>
              <span className="text-xs text-muted-foreground block">
                {r.stageName}
                {r.contractorName ? ` · ${r.contractorName}` : ' · исполнитель не назначен'}
              </span>
            </span>
            {r.daysOverdue !== null && r.daysOverdue > 0 && (
              <Badge variant="destructive">
                {r.daysOverdue} {daysWord(r.daysOverdue)} просрочки
              </Badge>
            )}
            {r.plannedDate && (
              <span className="text-xs text-muted-foreground tabular-nums">
                план: {fmtDate(r.plannedDate)}
              </span>
            )}
            <Badge variant="outline" className="text-xxs text-muted-foreground">
              {ORDER_STATUS_LABELS[r.orderStatus] ?? r.orderStatus}
            </Badge>
          </Link>
        ))}
        {hidden > 0 && (
          <div className="text-xs text-muted-foreground text-center pt-1">
            И ещё {hidden} —{' '}
            <Link href="/admin/orders" className="underline underline-offset-2">
              открыть список заявок
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ── Секция «Лиды без движения» ─────────────────────────────────

function StaleLeadsSection({ count, rows }: { count: number; rows: LeadAttention[] }) {
  if (count === 0) return null
  const hidden = count - rows.length

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <PauseCircle className="size-4 text-muted-foreground" />
          Лиды без движения
          <Badge variant="outline" className="bg-muted text-muted-foreground">
            {count}
          </Badge>
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Нет изменений дольше 3 дней — напомнить клиенту или закрыть отказом
        </p>
      </CardHeader>
      <CardContent className="grid gap-2">
        {rows.map((l) => (
          <Link
            key={l.leadId}
            href={`/admin/leads/${l.leadId}`}
            className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border p-3 transition-colors hover:border-ring"
          >
            <span className="min-w-40 flex-1 font-medium">{l.contactName}</span>
            <Badge variant="outline" className="text-xxs text-muted-foreground">
              {LEAD_STATUS_LABELS[l.status] ?? l.status}
            </Badge>
            <span className="text-sm text-muted-foreground tabular-nums">
              {l.daysIdle} {daysWord(l.daysIdle)} без изменений
            </span>
            <span className="text-xs text-muted-foreground tabular-nums">
              отклик: {fmtDate(l.updatedAt)}
            </span>
          </Link>
        ))}
        {hidden > 0 && (
          <div className="text-xs text-muted-foreground text-center pt-1">
            И ещё {hidden} —{' '}
            <Link href="/admin/leads" className="underline underline-offset-2">
              открыть список лидов
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
