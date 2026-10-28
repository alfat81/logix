import { BROKER_KIND_LABELS } from '@/lib/brokers'

// v0.5.0 (P1-22): типы и общие константы справочника брокеров —
// выезд из BrokersList.tsx (резка под лимит 300, RULES 2.14).
// Семантика прежняя (Д): брокер заводится напрямую с логином портала,
// деактивация закрывает доступ, связи со сделками не рвутся,
// DELETE не существует.

export type BrokerRow = {
  id: string
  companyName: string
  phone: string
  email: string | null
  isInHouse: boolean
  isActive: boolean
  comment: string | null
  createdAt: string
  _count: { leadLinks: number; orderLinks: number }
}

export type BrokerFilter = 'all' | 'active' | 'inactive'

export type BrokerForm = {
  companyName: string
  phone: string
  email: string
  password: string
  isInHouse: boolean
  comment: string
}

export const EMPTY_BROKER_FORM: BrokerForm = {
  companyName: '',
  phone: '',
  email: '',
  password: '',
  isInHouse: false,
  comment: '',
}

export const BROKER_KIND_TEXT = BROKER_KIND_LABELS

export const fmtBrokerDate = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleDateString('ru-RU') : ''
