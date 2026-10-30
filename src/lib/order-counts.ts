import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import {
  ORDER_ACTIVE_STATUSES,
  ORDER_STATUSES,
  type OrderStatus,
} from '@/lib/order-constants'

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
