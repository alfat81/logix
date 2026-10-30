'use client'

import { Badge } from '@/components/ui/badge'
import { CONTRACTOR_LEAD_STATUS_LABELS, type ContractorLeadStatus } from '@/lib/contractors'
import { CONTRACTOR_LEAD_BADGE_VARIANTS } from '@/lib/status-badges'

// v0.5.0 (P1-22): бейдж статуса кандидата — выезд из
// ContractorLeadsSection.tsx (резка под лимит 300, RULES 2.14).
// v0.7.10 (DF-22): варианты — общий маппинг BRANDBOOK §3.2
// (CONTRACTOR_LEAD_BADGE_VARIANTS объявлен в status-badges.ts при
// DF-20, но не был подключён — остались до-DF-20 сплошные заливки
// bg-info/bg-warning/bg-success/bg-destructive: цвет несёт точка,
// текст тёмный, сплошная заливка — только критичное).
export function ContractorLeadStatusBadge({ status }: { status: ContractorLeadStatus }) {
  return (
    <Badge variant={CONTRACTOR_LEAD_BADGE_VARIANTS[status]}>
      {CONTRACTOR_LEAD_STATUS_LABELS[status]}
    </Badge>
  )
}
