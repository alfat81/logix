import { Badge } from '@/components/ui/badge'
import {
  ORDER_STATUS_LABELS,
  STAGE_STATUS_LABELS,
  type OrderStatus,
  type StageStatus,
} from '@/lib/order-constants'
import { LEAD_STATUS_LABELS, type LeadStatus } from '@/lib/leads'

// Локальные копии бейджей кабинета клиента (паттерн портала подрядчика
// Г4: та же палитра, что в админке, но без общего импорта — «три
// кабинета — три судьбы» (роадмап, раздел 1), порталы не срастаются
// раньше времени).

export function ClientOrderStatusBadge({ status }: { status: OrderStatus }) {
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

export function ClientStageStatusBadge({ status }: { status: StageStatus }) {
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

export function ClientLeadStatusBadge({ status }: { status: LeadStatus }) {
  const map: Record<LeadStatus, string> = {
    new: 'bg-info text-info-foreground',
    calculated: 'bg-warning text-warning-foreground',
    won: 'bg-success text-success-foreground',
    lost: 'bg-destructive text-destructive-foreground',
  }
  return (
    <Badge className={`${map[status]} border-transparent`} variant="outline">
      {LEAD_STATUS_LABELS[status]}
    </Badge>
  )
}
