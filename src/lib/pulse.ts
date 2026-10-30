// ─── DF-07 «Пульс» владельца: чистая сборка блоков ───────────────────
// Пульс отвечает мастеру с телефона (Г1: ≤ 10 секунд — «сколько заявок
// в работе, где груз, что и у кого стоит»). Экран /admin/pulse +
// GET /api/admin/pulse. Файл БЕЗ серверных зависимостей (как waiting.ts):
// unit-тесты и UI импортируют напрямую, БД-запросы живут в API-роуте.
//
// Принципы карточки DF-07:
//   • только агрегаты по существующим таблицам, новых сущностей нет;
//   • «активная заявка» = ORDER_ACTIVE_STATUSES (то же определение, что
//     в «Требует внимания» Ж5 и счётчиках навигации §4.1 — один источник);
//   • «Кто тормозит» — группировка активных заявок по waitingOnKind
//     (DF-05): число и самое старое waitingSince, раскрытие до списка;
//   • подрядчик в подписях — «перевозчик» (глоссарий RULES 2.6, D31:
//     kind contractor виден только сотрудникам — Пульс сотрудничий).
import { calcOrderEta, summarizeOrderStages, type StageViewRow } from './order-summary'
import { ORDER_ACTIVE_STATUSES, type OrderStatus } from './order-constants'
import type { WaitingKind } from './waiting'

// ─── Объёмы выдачи (срезы лимитом, счётчики — полные, как в Ж5) ──────
export const PULSE_CARGO_LIMIT = 50
export const PULSE_SLOWING_GROUP_LIMIT = 20
export const PULSE_EVENTS_LIMIT = 20
export const PULSE_EVENT_WINDOW_HOURS = 24

// ─── Вход мастера открывает Пульс (карточка: «вход мастера открывает
// Пульс», настройка в профиле — вне скоупа). Менеджер — как было.
export function masterLandingPath(roles: readonly string[]): '/admin/pulse' | '/admin' {
  return roles.includes('master') ? '/admin/pulse' : '/admin'
}

// ─── Цифры (блок 1) ──────────────────────────────────────────────────
export type PulseStats = {
  // новых запросов за 24 ч
  newLeads24h: number
  // активных заявок (calculating | confirmed | in_progress)
  activeOrders: number
  // в пути — статус in_progress
  inProgress: number
  // ждут дольше порога (waiting.attention_hours, DF-05)
  waitingOverThreshold: number
  // этапов с проблемой на активных заявках
  problemStages: number
  // порог секции — для подписи в UI
  attentionHours: number
}

// ─── «Где груз» (блок 2) ─────────────────────────────────────────────
export type CargoOrderInput = {
  id: string
  number: string
  status: string
  customer: { name: string } | null
  stages: StageViewRow[]
}

export type PulseCargoRow = {
  orderId: string
  number: string
  customerName: string
  status: OrderStatus
  nearestStageName: string | null
  nearestStageStatus: string | null
  // исполнитель этапа — перевозчик (глоссарий RULES 2.6)
  contractorName: string | null
  // ETA = максимальная плановая дата незавершённых этапов (calcOrderEta)
  eta: string | null
  overdue: boolean
}

export function isActiveOrderStatus(status: string): boolean {
  return (ORDER_ACTIVE_STATUSES as readonly string[]).includes(status)
}

// Строка «Где груз» из заявки с этапами: ближайший этап, исполнитель,
// ETA и просрочка — семантика summarizeOrderStages/calcOrderEta (Ж4/Ж6а).
export function buildCargoRow(
  order: CargoOrderInput,
  stageNames: Map<string, string>,
  todayUtc: number
): PulseCargoRow {
  const summary = summarizeOrderStages(order.stages, stageNames, todayUtc)
  const eta = calcOrderEta(order.stages)
  return {
    orderId: order.id,
    number: order.number,
    customerName: order.customer?.name ?? '—',
    status: order.status as OrderStatus,
    nearestStageName: summary.nearestStage?.name ?? null,
    nearestStageStatus: summary.nearestStage?.status ?? null,
    contractorName: summary.nearestStage?.contractorName ?? null,
    eta: eta ? eta.toISOString() : null,
    overdue: summary.overdue,
  }
}

// ─── Ответ API целиком (клиентские типы Пульса реэкспортируют отсюда) ─
export type PulseData = {
  generatedAt: string
  stats: PulseStats
  cargo: PulseCargoRow[]
  cargoTotal: number
  slowing: SlowingGroup[]
  events: PulseEvent[]
}

export type PulseEvent = {
  id: string
  actorName: string
  type: string
  description: string
  isInternal: boolean
  createdAt: string
  leadId: string | null
  orderId: string | null
}

// ─── «Кто тормозит» (блок 3) ─────────────────────────────────────────
export type SlowingOrderInput = {
  id: string
  number: string
  customer: { name: string } | null
  waitingOnKind: string | null
  waitingReason: string | null
  waitingSince: Date | null
}

export type SlowingOrder = {
  orderId: string
  number: string
  customerName: string
  waitingReason: string | null
  waitingSince: string
}

export type SlowingGroup = {
  kind: Exclude<WaitingKind, 'none'>
  count: number
  oldestSince: string
  hiddenCount: number
  orders: SlowingOrder[]
}

// Заголовки групп: дательный падеж «Мяч у …». WAITING_KIND_LABELS —
// родительный для плашки «Ждёт: …», здесь своя форма (не дубликат:
// другой словарь под другой контекст, карточка DF-07).
export const PULSE_KIND_TITLES: Record<Exclude<WaitingKind, 'none'>, string> = {
  manager: 'Мяч у менеджера',
  client: 'Мяч у клиента',
  broker: 'Мяч у брокера',
  contractor: 'Мяч у перевозчика',
}

// Порядок групп при равном возрасте мяча — приоритет ответственности:
// сначала то, что чинит команда, потом внешние стороны.
const KIND_PRIORITY: Array<Exclude<WaitingKind, 'none'>> = [
  'manager',
  'client',
  'broker',
  'contractor',
]

// Группировка активных заявок по waitingOnKind (DF-05). NULL waitingSince
// («ещё не пересчитано») и kind none/NULL не участвуют. Группы — по
// возрасту мяча (самое старое сверху), внутри — тоже по возрасту;
// счётчик полный, список — лимитом (раскрытие, Ж5-размен).
export function groupSlowingOrders(
  rows: SlowingOrderInput[],
  perGroupLimit: number
): SlowingGroup[] {
  const buckets = new Map<Exclude<WaitingKind, 'none'>, SlowingOrderInput[]>()
  for (const row of rows) {
    const kind = row.waitingOnKind
    if (!kind || kind === 'none' || !row.waitingSince) continue
    if (!(kind in PULSE_KIND_TITLES)) continue
    const list = buckets.get(kind as Exclude<WaitingKind, 'none'>) ?? []
    list.push(row)
    buckets.set(kind as Exclude<WaitingKind, 'none'>, list)
  }

  const groups: SlowingGroup[] = []
  for (const [kind, list] of buckets) {
    const sorted = [...list].sort(
      (a, b) => (a.waitingSince?.getTime() ?? 0) - (b.waitingSince?.getTime() ?? 0)
    )
    const oldest = sorted[0].waitingSince as Date
    groups.push({
      kind,
      count: sorted.length,
      oldestSince: oldest.toISOString(),
      hiddenCount: Math.max(0, sorted.length - perGroupLimit),
      orders: sorted.slice(0, perGroupLimit).map((o) => ({
        orderId: o.id,
        number: o.number,
        customerName: o.customer?.name ?? '—',
        waitingReason: o.waitingReason,
        waitingSince: (o.waitingSince as Date).toISOString(),
      })),
    })
  }

  return groups.sort((a, b) => {
    const byAge = a.oldestSince.localeCompare(b.oldestSince)
    if (byAge !== 0) return byAge
    return KIND_PRIORITY.indexOf(a.kind) - KIND_PRIORITY.indexOf(b.kind)
  })
}
