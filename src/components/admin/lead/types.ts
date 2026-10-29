// Типы карточки лида (P1-19: вынесены из LeadCard.tsx при резке —
// RULES 2.14, файлы ≤ 300). Чистые типы без серверных зависимостей.
import type { ActivityRow } from '@/components/admin/ActivityFeed'
import type { BrokerLinkRow } from '@/components/admin/BrokerLinksSection'
import type { QuoteOptionRow } from '@/components/admin/QuoteOptionsSection'
import type { LeadStatus } from '@/lib/leads'

export type LeadFull = {
  id: string
  status: LeadStatus
  lostReason: string | null
  createdAt: string
  source: string
  rawContact: { name: string; phone?: string; email?: string } | null
  cargoInfo: Record<string, unknown> | null
  customer: { id: string; name: string; phone: string | null; email: string | null } | null
  // P1-03: маршрут/метрики — колонки
  originCity?: string | null
  originCountry?: string | null
  destinationCity?: string | null
  destinationCountry?: string | null
  transportType?: string | null
  readyDate?: string | null
  weightKg?: string | number | null
  volumeM3?: string | number | null
  placesCount?: number | null
  // DF-17: коды из справочников (страны маршрута, условие поставки)
  originCountryCode?: string | null
  destinationCountryCode?: string | null
  incotermCode?: string | null
  // DF-19: место условия поставки (стартовое значение формы расчёта)
  incotermPlace?: string | null
  // P1-01: ответственный менеджер (null = не назначен — кабинетный запрос)
  assignee: { id: string; name: string } | null
  options: QuoteOptionRow[]
  order: { id: string; number: string; status: string } | null
  // Д: брокеры расчёта с оценками таможенных платежей (оценка — на
  // связи LeadBroker, 1:1)
  brokers: BrokerLinkRow[]
  // Ж2: лента событий — внутри GET карточки и ответов действий
  activities: ActivityRow[]
}

export type LegalEntityRow = { id: string; name: string }

export const fmtDate = (iso: string): string => new Date(iso).toLocaleDateString('ru-RU')
