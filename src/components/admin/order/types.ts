// Типы карточки заявки (P1-19: вынесены из page.tsx при резке монолита
// 1169 строк — RULES 2.14, файлы ≤ 300). Чистые типы без зависимостей.
import type { ActivityRow } from '@/components/admin/ActivityFeed'
import type { BrokerLinkRow, BrokerEstimateRow } from '@/components/admin/BrokerLinksSection'
import type { CargoProfile, OrderStatus, StageStatus } from '@/lib/order-constants'

export type StageRow = {
  id: string
  stageCode: string
  name: string
  isMandatory: boolean
  sequence: number
  status: StageStatus
  plannedDate: string | null
  actualDate: string | null
  // Исполнитель этапа (Г3): приходит внутри карточки заявки,
  // публичная проекция без пароля.
  contractor: { id: string; companyName: string; phone: string; isActive: boolean } | null
}

// Пул для назначения на этап (Г5): только активные — исключённому
// сервер ответит 409 (мягкое исключение, Г3). isActive нужен для
// пометки «исключён», если такой уже назначен на этапе.
export type PoolRow = { id: string; companyName: string; phone: string; isActive: boolean }

export type OrderFull = {
  id: string
  number: string
  status: OrderStatus
  incoterm: string | null
  cargoProfile: CargoProfile
  hsCode: string | null
  createdAt: string
  // DF-05: вычисляемое ожидание — плашка в шапке карточки заявки
  waitingOnKind?: string | null
  waitingReason?: string | null
  waitingSince?: string | null
  // DF-17/DF-19: условие поставки кодом + место (стартовые значения
  // формы расчёта таможенных платежей)
  incotermCode?: string | null
  incotermPlace?: string | null
  // Ж1: суть заявки. cargoInfo — форма бланка (как у лида),
  // quoteSnapshot — снимок условий сделки; оба — копии с лида
  // при конвертации, дальше — источник правды сама заявка.
  cargoInfo: Record<string, unknown> | null
  quoteSnapshot: QuoteSnapshot
  // Ж1: лид-источник (заявки без лида — leadId null, Б3)
  leadId: string | null
  // P1-01: ответственный менеджер (null = не назначена)
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
  assignee: { id: string; name: string } | null
  // Д: лид-источник несёт брокеров расчёта с оценками (перенос в
  // заявку при конвертации В4 — оценка живёт на связи лида)
  lead: {
    id: string
    createdAt: string
    brokers: {
      id: string
      broker: { id: string; companyName: string; isActive: boolean }
      estimate: BrokerEstimateRow | null
    }[]
  } | null
  // Д: брокеры заявки — видимость целиком (OrderBroker)
  brokers: BrokerLinkRow[]
  customer: { id: string; name: string; phone: string | null; email: string | null }
  contract: { id: string; number: number; legalEntity: { name: string } }
  legalEntity: { id: string; name: string }
  stages: StageRow[]
  // Ж2: лента событий — приходит внутри GET карточки (свежие сверху)
  activities: ActivityRow[]
}

// Снимок условий (структура — QuoteSnapshotSchema в lib/leads.ts);
// чтение толерантное: неизвестных/отсутствующих полей просто нет.
// P1-04: цена с валютой и меткой НДС; priceEstimate — легаси-ключ
// снимков до миграции (рубли), читается как RUB-фолбэк.
export type QuoteSnapshot = {
  description?: string
  transportModes?: string[] | null
  price?: number | string
  currency?: string
  vatMode?: string
  priceEstimate?: number
  etaDays?: number
  priorityFit?: string
} | null

export type CatalogRow = {
  id: string
  code: string
  name: string
  order: number
  isMandatory: boolean
}

export const fmtDate = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleDateString('ru-RU') : '—'
