import type { ContractorLeadStatus } from '@/lib/contractors'

// v0.5.0 (P1-22): типы и общие константы воронки квалификации
// подрядчиков (Г5) — выезд из ContractorLeadsSection.tsx (резка под
// лимит 300, RULES 2.14).

export type ContractorLeadRow = {
  id: string
  companyName: string
  status: ContractorLeadStatus
  rejectReason: string | null
  createdAt: string
  rawInfo: Record<string, unknown> | null
  contractor: { id: string; companyName: string; phone: string; isActive: boolean } | null
}

export const fmtLeadDate = (iso: string): string =>
  new Date(iso).toLocaleDateString('ru-RU')
