import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import {
  ORDER_ACTIVE_STATUSES,
  ORDER_STATUSES,
  type OrderStatus,
} from '@/lib/order-constants'
import { DOC_LIST_READY_WHERE } from '@/lib/documents'

// ─── DF-21: счётчики заявок — единый источник ───────────────────────
// Бейдж «Заявки» в меню (layout) и табы статусов списка (API
// GET /api/admin/orders) считают из ОДНОГО места: здесь. Раньше layout
// делал свой count по ORDER_ACTIVE_STATUSES, а роут — свой groupBy:
// определения групп совпадали, но доказать «бейдж == сумма активных
// табов» можно было только по построению констант. Теперь оба
// потребителя вызывают orderStatusCounts() (одна форма groupBy) и
// активный итог — activeOrdersTotal() (чистая, unit-тест DF-21).

export type OrderStatusCounts = Record<'all' | OrderStatus, number>

// Каркас счётчиков: нули по всем статусам (порядок ключей — порядок
// ORDER_STATUSES, табы рендерятся из него же).
export function emptyOrderStatusCounts(): OrderStatusCounts {
  const counts = { all: 0 } as OrderStatusCounts
  for (const s of ORDER_STATUSES) counts[s] = 0
  return counts
}

// Наполнение каркаса из результата groupBy by:['status'].
export function fillOrderStatusCounts(
  counts: OrderStatusCounts,
  grouped: Array<{ status: string; _count: { _all: number } }>,
): OrderStatusCounts {
  for (const g of grouped) {
    const n = g._count._all
    if ((ORDER_STATUSES as readonly string[]).includes(g.status)) {
      counts[g.status as OrderStatus] = n
      counts.all += n
    }
  }
  return counts
}

// Счётчики по статусам (where — например, поиск списка без фильтра
// таба: табы показывают распределение найденного).
export async function orderStatusCounts(
  where?: Prisma.OrderWhereInput,
): Promise<OrderStatusCounts> {
  const grouped = await db.order.groupBy({
    by: ['status'],
    where,
    _count: { _all: true },
  })
  return fillOrderStatusCounts(emptyOrderStatusCounts(), grouped)
}

// Сумма активных статусов (calculating+confirmed+in_progress) — число
// бейджа «Заявки»; e2e сверяет его с суммой активных табов API.
export function activeOrdersTotal(counts: OrderStatusCounts): number {
  return ORDER_ACTIVE_STATUSES.reduce((sum, s) => sum + (counts[s] ?? 0), 0)
}

// ─── DF-26 §3.7: строка документов на карточке заявки в списке ──────
// «Документы: N · M разрешительных ожидаются» — счётчики из этого же
// модуля (единый источник со списком): N — документы с готовой версией
// (списки показывают только ready), M — ненагруженные pending («на
// проверке» в список не выводится — позиция не «не готово», §3.4).
// Два groupBy на страницу списка — дешевле N+1 include.
export type OrderDocCounts = { docs: number; permitsPending: number }

export async function orderDocListCounts(
  orderIds: readonly string[],
): Promise<Map<string, OrderDocCounts>> {
  const ids = [...orderIds]
  const map = new Map<string, OrderDocCounts>(ids.map((id) => [id, { docs: 0, permitsPending: 0 }]))
  if (ids.length === 0) return map
  const [docs, permits] = await Promise.all([
    db.document.groupBy({
      by: ['orderId'],
      where: { orderId: { in: ids }, ...DOC_LIST_READY_WHERE },
      _count: { _all: true },
    }),
    db.permitRequirement.groupBy({
      by: ['orderId'],
      where: { orderId: { in: ids }, status: 'pending' },
      _count: { _all: true },
    }),
  ])
  for (const g of docs) {
    if (!g.orderId) continue
    const c = map.get(g.orderId)
    if (c) c.docs = g._count._all
  }
  for (const g of permits) {
    if (!g.orderId) continue
    const c = map.get(g.orderId)
    if (c) c.permitsPending = g._count._all
  }
  return map
}
