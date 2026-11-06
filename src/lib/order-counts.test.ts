import { afterEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/lib/db'
import {
  activeOrdersTotal,
  emptyOrderStatusCounts,
  fillOrderStatusCounts,
  orderDocListCounts,
} from '@/lib/order-counts'
import { ORDER_ACTIVE_STATUSES, ORDER_STATUSES } from '@/lib/order-constants'

// DF-21: счётчики заявок — единый источник для бейджа меню и табов
// списка. Проверяется чистый слой: каркас, наполнение, активный итог
// (групповые запросы к БД покрывает e2e).
// DF-26 §3.7 (T21-04): строка «Документы: N · M разрешительных
// ожидаются» — каркас orderDocListCounts (карта по id, нули без строк,
// короткое замыкание на пустом списке).

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

describe('orderDocListCounts (DF-26 §3.7: строка документов в списке)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('пустой список id — нулевая карта, БД не запрашивается', async () => {
    const docSpy = vi.spyOn(db.document, 'groupBy')
    const permitSpy = vi.spyOn(db.permitRequirement, 'groupBy')
    const map = await orderDocListCounts([])
    expect(map.size).toBe(0)
    expect(docSpy).not.toHaveBeenCalled()
    expect(permitSpy).not.toHaveBeenCalled()
  })

  it('счётчики по заявкам: документы с готовой версией + pending-разрешительные', async () => {
    vi.spyOn(db.document, 'groupBy').mockResolvedValue([
      { orderId: 'o1', _count: { _all: 8 } },
      { orderId: 'o3', _count: { _all: 1 } },
    ] as never)
    vi.spyOn(db.permitRequirement, 'groupBy').mockResolvedValue([
      { orderId: 'o1', _count: { _all: 2 } },
    ] as never)
    const map = await orderDocListCounts(['o1', 'o2', 'o3'])
    // «Документы: 8 · 2 разрешительных ожидаются»
    expect(map.get('o1')).toEqual({ docs: 8, permitsPending: 2 })
    // заявка без строк — нули (каркас по всем запрошенным id)
    expect(map.get('o2')).toEqual({ docs: 0, permitsPending: 0 })
    expect(map.get('o3')).toEqual({ docs: 1, permitsPending: 0 })
    expect(map.size).toBe(3)
  })

  it('строки groupBy с orderId null игнорируются (документ вне сделки)', async () => {
    vi.spyOn(db.document, 'groupBy').mockResolvedValue([
      { orderId: null, _count: { _all: 5 } },
      { orderId: 'o1', _count: { _all: 2 } },
    ] as never)
    vi.spyOn(db.permitRequirement, 'groupBy').mockResolvedValue([
      { orderId: null, _count: { _all: 3 } },
    ] as never)
    const map = await orderDocListCounts(['o1'])
    expect(map.get('o1')).toEqual({ docs: 2, permitsPending: 0 })
  })
})
