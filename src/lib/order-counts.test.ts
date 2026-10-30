import { describe, expect, it } from 'vitest'
import {
  activeOrdersTotal,
  emptyOrderStatusCounts,
  fillOrderStatusCounts,
} from '@/lib/order-counts'
import { ORDER_ACTIVE_STATUSES, ORDER_STATUSES } from '@/lib/order-constants'

// DF-21: счётчики заявок — единый источник для бейджа меню и табов
// списка. Проверяется чистый слой: каркас, наполнение, активный итог
// (групповые запросы к БД покрывает e2e).

describe('order-counts (DF-21: один источник счётчиков)', () => {
  it('каркас содержит все статусы ORDER_STATUSES и «all», нули', () => {
    const counts = emptyOrderStatusCounts()
    for (const s of ORDER_STATUSES) expect(counts[s]).toBe(0)
    expect(counts.all).toBe(0)
  })

  it('наполнение из groupBy: статусы заполняются, all — сумма', () => {
    const counts = fillOrderStatusCounts(emptyOrderStatusCounts(), [
      { status: 'calculating', _count: { _all: 3 } },
      { status: 'in_progress', _count: { _all: 2 } },
      { status: 'completed', _count: { _all: 5 } },
    ])
    expect(counts.calculating).toBe(3)
    expect(counts.in_progress).toBe(2)
    expect(counts.completed).toBe(5)
    expect(counts.confirmed).toBe(0)
    expect(counts.all).toBe(10)
  })

  it('пустой groupBy — нули (система работает до первых заявок)', () => {
    const counts = fillOrderStatusCounts(emptyOrderStatusCounts(), [])
    expect(counts.all).toBe(0)
    expect(activeOrdersTotal(counts)).toBe(0)
  })

  it('активный итог — сумма ORDER_ACTIVE_STATUSES (бейдж == сумма активных табов)', () => {
    const counts = fillOrderStatusCounts(emptyOrderStatusCounts(), [
      { status: 'calculating', _count: { _all: 1 } },
      { status: 'confirmed', _count: { _all: 2 } },
      { status: 'in_progress', _count: { _all: 3 } },
      { status: 'completed', _count: { _all: 4 } },
      { status: 'cancelled', _count: { _all: 5 } },
    ])
    const expected = ORDER_ACTIVE_STATUSES.reduce((sum, s) => sum + counts[s], 0)
    expect(activeOrdersTotal(counts)).toBe(6)
    expect(activeOrdersTotal(counts)).toBe(expected)
  })

  it('неизвестный статус groupBy не ломает каркас (защита от мусора в БД)', () => {
    const counts = fillOrderStatusCounts(emptyOrderStatusCounts(), [
      { status: 'mystery', _count: { _all: 7 } },
      { status: 'calculating', _count: { _all: 1 } },
    ])
    expect(counts.all).toBe(1)
    expect(counts.calculating).toBe(1)
  })
})
