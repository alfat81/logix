// v0.5.0 (P1-22): типы пула подрядчиков (Г5) — выезд из
// ContractorPoolSection.tsx (резка под лимит 300, RULES 2.14).

export type ContractorRow = {
  id: string
  companyName: string
  phone: string
  competencies: Record<string, unknown> | null
  contactInfo: Record<string, unknown> | null
  contractNumber: string | null
  contractSignedAt: string | null
  isActive: boolean
  comment: string | null
  createdAt: string
  _count: { stages: number }
}

export type PoolFilter = 'all' | 'active' | 'excluded'

export type PoolForm = {
  companyName: string
  phone: string
  password: string
  transports: string[]
  directions: string
  contractNumber: string
  contractSignedAt: string
  comment: string
}

export const fmtPoolDate = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleDateString('ru-RU') : ''
