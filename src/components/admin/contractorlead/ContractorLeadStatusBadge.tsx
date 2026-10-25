'use client'

import { Badge } from '@/components/ui/badge'
import { CONTRACTOR_LEAD_STATUS_LABELS, type ContractorLeadStatus } from '@/lib/contractors'

// v0.5.0 (P1-22): бейдж статуса кандидата — выезд из
// ContractorLeadsSection.tsx (резка под лимит 300, RULES 2.14).
// Цветовые пары §3.2: info/warning/success/destructive.
export function ContractorLeadStatusBadge({ status }: { status: ContractorLeadStatus }) {
  const map: Record<ContractorLeadStatus, string> = {
    new: 'bg-info text-info-foreground',
    qualifying: 'bg-warning text-warning-foreground',
    contracted: 'bg-success text-success-foreground',
    rejected: 'bg-destructive text-destructive-foreground',
  }
  return (
    <Badge className={`${map[status]} border-transparent`} variant="outline">
      {CONTRACTOR_LEAD_STATUS_LABELS[status]}
    </Badge>
  )
}
