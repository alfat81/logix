// Типы карточки лида (P1-19: вынесены из LeadCard.tsx при резке —
// RULES 2.14, файлы ≤ 300). Чистые типы без серверных зависимостей.
import type { ActivityRow } from '@/components/admin/ActivityFeed'
import type { BrokerLinkRow } from '@/components/admin/BrokerLinksSection'
import type { QuoteOptionRow } from '@/components/admin/QuoteOptionsSection'
import type { LeadBlankView } from '@/components/admin/QuoteOptionRouteBlocks'
import { readLeadCargo, type LeadStatus } from '@/lib/leads'

export type LeadFull = {
  id: string
  status: LeadStatus
  lostReason: string | null
  createdAt: string
  source: string
  // Поток A (BL): активное согласование расчёта — метаданные факта
  selectedOptionId?: string | null
  clientConfirmedAt?: string | null
  clientConfirmedVia?: string | null
  clientConfirmedByName?: string | null
  // DF-05: вычисляемое ожидание — плашка в шапке карточки запроса
  waitingOnKind?: string | null
  waitingReason?: string | null
  waitingSince?: string | null
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
  // DF-27: пожелания к перевозке (колонка с волны 1; формы — волна 2)
  wishes?: string | null
  // DF-27: вычисляемая готовность анкеты (staff-проекция GET карточки)
  completeness?: { ready: boolean; missing: string[] } | null
  order: { id: string; number: string; status: string } | null
  // Д: брокеры расчёта с оценками таможенных платежей (оценка — на
  // связи LeadBroker, 1:1)
  brokers: BrokerLinkRow[]
  // Ж2: лента событий — внутри GET карточки и ответов действий
  activities: ActivityRow[]
}

export type LegalEntityRow = { id: string; name: string }

export const fmtDate = (iso: string): string => new Date(iso).toLocaleDateString('ru-RU')

// ─── DF-27 волна 1: бланк запроса для блока 1 диалога варианта ──────
// Вынесено из LeadCard.tsx (RULES 2.14): одна точка сборки вида
// «как в запросе» из строки лида — карточка и другие потребители
// показывают блок 1 одинаково.
export function leadBlankView(lead: LeadFull): LeadBlankView {
  const cargo = readLeadCargo(lead.cargoInfo)
  return {
    origin: [lead.originCity, lead.originCountry].filter(Boolean).join(', '),
    destination: [lead.destinationCity, lead.destinationCountry].filter(Boolean).join(', '),
    transportType: lead.transportType ?? '',
    readyDate: lead.readyDate ? fmtDate(lead.readyDate) : '',
    incoterm: lead.incotermCode ?? '',
    cargoName: cargo.cargoName != null ? String(cargo.cargoName) : '',
    hsCode: cargo.hsCode != null ? String(cargo.hsCode) : '',
    weight: lead.weightKg != null ? String(lead.weightKg) : '',
    volume: lead.volumeM3 != null ? String(lead.volumeM3) : '',
    places: lead.placesCount != null ? String(lead.placesCount) : '',
    value: cargo.cargoValue != null ? String(cargo.cargoValue) : '',
  }
}
