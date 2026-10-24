import { describe, expect, it } from 'vitest'
import { calcOrderEta, summarizeOrderStages } from './orders'

// v0.3.1 (BRANDBOOK §4.2–4.3): ETA и имя просроченного этапа — данные
// карточки заявки в списке. Функции lib/orders.ts — единый код-путь
// для списка админки и будущих проекций (RULES 2.15 дух: арифметика
// дат — только в src/lib).

const D = (iso: string) => new Date(iso)
const names = new Map([
  ['transport', 'Международная перевозка'],
  ['final_delivery', 'Доставка до получателя'],
])

describe('calcOrderEta', () => {
  it('ETA — максимум плана среди незавершённых (не план ближайшего)', () => {
    const eta = calcOrderEta([
      { status: 'not_started', plannedDate: D('2026-11-01T00:00:00.000Z') },
      { status: 'in_progress', plannedDate: D('2026-11-20T00:00:00.000Z') },
    ])
    expect(eta?.toISOString()).toBe('2026-11-20T00:00:00.000Z')
  })

  it('завершённые этапы и этапы без плана не участвуют', () => {
    const eta = calcOrderEta([
      { status: 'done', plannedDate: D('2026-12-31T00:00:00.000Z') },
      { status: 'not_started', plannedDate: null },
      { status: 'problem', plannedDate: D('2026-11-05T00:00:00.000Z') },
    ])
    expect(eta?.toISOString()).toBe('2026-11-05T00:00:00.000Z')
  })

  it('нет дат или всё завершено — null', () => {
    expect(calcOrderEta([{ status: 'not_started', plannedDate: null }])).toBeNull()
    expect(calcOrderEta([{ status: 'done', plannedDate: D('2026-01-01T00:00:00.000Z') }])).toBeNull()
    expect(calcOrderEta([])).toBeNull()
  })
})

describe('summarizeOrderStages — просрочка с именем этапа', () => {
  const today = Date.UTC(2026, 9, 25) // 25.10.2026 UTC

  it('имя просроченного этапа — из словаря каталога', () => {
    const s = summarizeOrderStages(
      [
        { stageCode: 'transport', status: 'in_progress', plannedDate: D('2026-10-20T00:00:00.000Z'), contractor: null },
        { stageCode: 'final_delivery', status: 'not_started', plannedDate: D('2026-11-05T00:00:00.000Z'), contractor: null },
      ],
      names,
      today
    )
    expect(s.overdue).toBe(true)
    expect(s.overdueStage).toBe('Международная перевозка')
    expect(s.nearestStage?.name).toBe('Международная перевозка')
  })

  it('просроченный этап — НЕ ближайший: имя соответствует просрочке, не первому незавершённому', () => {
    const s = summarizeOrderStages(
      [
        { stageCode: 'transport', status: 'not_started', plannedDate: D('2026-11-10T00:00:00.000Z'), contractor: null },
        { stageCode: 'final_delivery', status: 'not_started', plannedDate: D('2026-10-01T00:00:00.000Z'), contractor: null },
      ],
      names,
      today
    )
    expect(s.overdue).toBe(true)
    expect(s.overdueStage).toBe('Доставка до получателя')
    expect(s.nearestStage?.code).toBe('transport')
  })

  it('без просрочки overdueStage = null', () => {
    const s = summarizeOrderStages(
      [{ stageCode: 'transport', status: 'not_started', plannedDate: D('2026-11-10T00:00:00.000Z'), contractor: null }],
      names,
      today
    )
    expect(s.overdue).toBe(false)
    expect(s.overdueStage).toBeNull()
  })

  it('план сегодня — ещё не просрочка (строго раньше todayUtc)', () => {
    const s = summarizeOrderStages(
      [{ stageCode: 'transport', status: 'not_started', plannedDate: D('2026-10-25T00:00:00.000Z'), contractor: null }],
      names,
      today
    )
    expect(s.overdue).toBe(false)
    expect(s.overdueStage).toBeNull()
  })
})
