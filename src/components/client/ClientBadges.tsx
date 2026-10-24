import { Badge } from '@/components/ui/badge'
import {
  ORDER_STATUS_LABELS,
  STAGE_STATUS_LABELS,
  type OrderStatus,
  type StageStatus,
} from '@/lib/order-constants'
import { LEAD_STATUS_LABELS, type LeadStatus } from '@/lib/leads'
import {
  LEAD_BADGE_VARIANTS,
  ORDER_BADGE_VARIANTS,
  STAGE_BADGE_VARIANTS,
} from '@/lib/status-badges'

// Бейджи кабинета клиента (P1-19): тексты — свои словари, визуал —
// варианты BRANDBOOK §3.2 из общей точки lib/status-badges.ts.
// Логика порталов не срастается («три кабинета — три судьбы») —
// общим остаётся только язык статусов, как lib/order-constants.

export function ClientOrderStatusBadge({ status }: { status: OrderStatus }) {
  return (
    <Badge variant={ORDER_BADGE_VARIANTS[status]}>{ORDER_STATUS_LABELS[status]}</Badge>
  )
}

export function ClientStageStatusBadge({ status }: { status: StageStatus }) {
  return (
    <Badge variant={STAGE_BADGE_VARIANTS[status]}>{STAGE_STATUS_LABELS[status]}</Badge>
  )
}

export function ClientLeadStatusBadge({ status }: { status: LeadStatus }) {
  return (
    <Badge variant={LEAD_BADGE_VARIANTS[status]}>{LEAD_STATUS_LABELS[status]}</Badge>
  )
}
