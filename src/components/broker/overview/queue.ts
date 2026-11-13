import { ORDER_ACTIVE_STATUSES, type OrderStatus } from '@/lib/order-constants'
import { readLeadCargo, type LeadStatus } from '@/lib/leads'
import { routeLineOf } from '@/lib/route-fields'
import { fmtDuty } from '@/lib/brokers'

// TU-01.8 (волна 4): очередь расчётов портала брокера по референсу
// brockercabinet.png. Чистые функции без React — сборка единой очереди
// из уже загруженных списков заявок и запросов (единая точка правды,
// без новых API и изменений контрактов), фильтры вкладок «Активные /
// Архив» и поиска, сводные счётчики. Демо-данные макета (#14-8, ИНВОЙС,
// «среднее время») не переносятся — только реальные поля системы
// (отклонения Д-22…Д-24, docs/design/tu01-DEVIATIONS.md).

export type BrokerOrderRow = {
  id: string
  number: string
  status: OrderStatus
  createdAt: string
  cargoInfo: Record<string, unknown> | null
  originCity?: string | null
  originCountry?: string | null
  destinationCity?: string | null
  destinationCountry?: string | null
  customerName: string | null
  estimate: { customsDutyEstimate: number | null } | null
}

export type BrokerLeadRow = {
  id: string
  status: LeadStatus
  createdAt: string
  cargoInfo: Record<string, unknown> | null
  originCity?: string | null
  originCountry?: string | null
  destinationCity?: string | null
  destinationCountry?: string | null
  customerName: string | null
  estimate: { customsDutyEstimate: number | null } | null
}

export type BrokerQueueKind = 'order' | 'lead'

export type BrokerQueueRow = {
  key: string
  kind: BrokerQueueKind
  id: string
  /** Номер договора-порядковый — только у заявки; у запроса номера нет (И1). */
  number: string | null
  status: OrderStatus | LeadStatus
  createdAt: string
  customerName: string | null
  cargoName: string
  hsCode: string
  routeFrom: string
  routeTo: string
  /** Оценка платежей RUB (DF-18) или null, если ещё не сообщалась. */
  payments: string | null
  /** Запрос без оценки платежей — ждёт работы брокера. */
  awaitingEstimate: boolean
  /** Терминальные статусы: вкладка «Архив». */
  archived: boolean
}

const ORDER_ARCHIVE_STATUSES: readonly OrderStatus[] = ['completed', 'cancelled']

function rowOf(row: BrokerOrderRow | BrokerLeadRow): {
  cargoName: string
  hsCode: string
  routeFrom: string
  routeTo: string
} {
  const c = readLeadCargo(row.cargoInfo)
  const s = (v: unknown): string => (typeof v === 'string' && v ? v : '')
  const line = routeLineOf(row, row.cargoInfo)
  return {
    cargoName: s(c.cargoName),
    hsCode: s(c.hsCode),
    routeFrom: s(line.from),
    routeTo: s(line.to),
  }
}

function orderRow(o: BrokerOrderRow): BrokerQueueRow {
  const duty = o.estimate?.customsDutyEstimate ?? null
  return {
    key: `order:${o.id}`,
    kind: 'order',
    id: o.id,
    number: o.number,
    status: o.status,
    createdAt: o.createdAt,
    customerName: o.customerName,
    ...rowOf(o),
    payments: duty === null ? null : fmtDuty(duty),
    awaitingEstimate: false,
    archived: ORDER_ARCHIVE_STATUSES.includes(o.status),
  }
}

function leadRow(l: BrokerLeadRow): BrokerQueueRow {
  const duty = l.estimate?.customsDutyEstimate ?? null
  return {
    key: `lead:${l.id}`,
    kind: 'lead',
    id: l.id,
    number: null,
    status: l.status,
    createdAt: l.createdAt,
    customerName: l.customerName,
    ...rowOf(l),
    payments: duty === null ? null : fmtDuty(duty),
    awaitingEstimate: duty === null && l.status !== 'lost',
    archived: l.status === 'lost',
  }
}

const byNewest = (a: BrokerQueueRow, b: BrokerQueueRow): number =>
  b.createdAt.localeCompare(a.createdAt)

/** Единая очередь: запросы (работа брокера) затем заявки, новые сверху. */
export function buildQueue(
  orders: BrokerOrderRow[],
  leads: BrokerLeadRow[]
): BrokerQueueRow[] {
  return [...leads.map(leadRow).sort(byNewest), ...orders.map(orderRow).sort(byNewest)]
}

export type BrokerQueueTab = 'active' | 'archive'

export function filterQueue(
  rows: BrokerQueueRow[],
  tab: BrokerQueueTab,
  query: string
): BrokerQueueRow[] {
  const q = query.trim().toLowerCase()
  return rows.filter((r) => {
    if (tab === 'active' ? r.archived : !r.archived) return false
    if (!q) return true
    const haystack = [r.number ?? 'запрос', r.customerName, r.cargoName, r.hsCode, r.routeFrom, r.routeTo]
    return haystack.some((v) => typeof v === 'string' && v.toLowerCase().includes(q))
  })
}

export type BrokerQueueCounters = {
  awaiting: number
  inWork: number
  completed: number
}

/** Сводные карточки — реальные счётчики из тех же списков (без новых API). */
export function queueCounters(rows: BrokerQueueRow[]): BrokerQueueCounters {
  return {
    awaiting: rows.filter((r) => r.kind === 'lead' && r.awaitingEstimate).length,
    inWork: rows.filter(
      (r) => r.kind === 'order' && (ORDER_ACTIVE_STATUSES as readonly string[]).includes(r.status)
    ).length,
    completed: rows.filter((r) => r.kind === 'order' && r.status === 'completed').length,
  }
}
