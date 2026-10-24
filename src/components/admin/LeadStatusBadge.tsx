import { Badge } from '@/components/ui/badge'
import { LEAD_BADGE_VARIANTS } from '@/lib/status-badges'
import { LEAD_STATUS_LABELS, type LeadStatus } from '@/lib/leads'

// v0.4.0: выезд из LeadsList.tsx (резка под лимит 300, RULES 2.14 —
// как OrderStatusBadge в v0.3.1). Бейдж статуса лида §3.2 — «таблетка»
// из единой точки маппинга lib/status-badges.ts; текст — словарь
// LEAD_STATUS_LABELS. Потребители (LeadCard, CustomerCard, GlobalSearch)
// импортируют отсюда либо через реэкспорт LeadsList.
export function LeadStatusBadge({ status }: { status: LeadStatus }) {
  return <Badge variant={LEAD_BADGE_VARIANTS[status]}>{LEAD_STATUS_LABELS[status]}</Badge>
}
