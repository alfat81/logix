import { describe, expect, it } from 'vitest'
import {
  PULSE_SLOWING_GROUP_LIMIT,
  buildCargoRow,
  groupSlowingOrders,
  isActiveOrderStatus,
  masterLandingPath,
  type CargoOrderInput,
  type SlowingOrderInput,
} from './pulse'
import { utcDayStart } from './order-summary'

// DF-07 «Пульс»: чистые правила сборки блоков. Кейсы — по карточке:
// цифры, «Где груз» (семантика Ж4/Ж6а), «Кто тормозит» (группировка
// waitingOnKind, DF-05), редирект входа мастера.

const TODAY_UTC = utcDayStart(new Date('2026-10-30T12:00:00Z'))
const day = (n: number) => new Date(Date.UTC(2026, 9, 30 - n, 12, 0, 0))

const stageNames = new Map([
  ['production', 'Производство'],
  ['delivery', 'Доставка'],
])

function cargoOrder(over: Partial<CargoOrderInput> = {}): CargoOrderInput {
  return {
    id: 'o1',
    number: '17-1',
    status: 'in_progress',
    customer: { name: 'ООО «Ромашка»' },
    stages: [],
    ...over,
  }
}

describe('masterLandingPath (вход мастера открывает Пульс)', () => {
  it('мастер — на /admin/pulse', () => {
    expect(masterLandingPath(['master'])).toBe('/admin/pulse')
  })

  it('менеджер — на /admin (как было)', () => {
    expect(masterLandingPath(['manager'])).toBe('/admin')
  })

  it('пустой список ролей — /admin', () => {
    expect(masterLandingPath([])).toBe('/admin')
  })
})

describe('isActiveOrderStatus (то же определение активной заявки, что в Ж5)', () => {
  it('расчёт/согласование/в работе — активные', () => {
    expect(isActiveOrderStatus('calculating')).toBe(true)
    expect(isActiveOrderStatus('confirmed')).toBe(true)
    expect(isActiveOrderStatus('in_progress')).toBe(true)
  })

  it('завершена/отменена — нет', () => {
    expect(isActiveOrderStatus('completed')).toBe(false)
    expect(isActiveOrderStatus('cancelled')).toBe(false)
  })
})

describe('buildCargoRow («Где груз»: этап, исполнитель, ETA)', () => {
  it('ближайший незавершённый этап — имя из каталога, перевозчик, план', () => {
    const row = buildCargoRow(
      cargoOrder({
        stages: [
          // день назад — просрочен; delivery — через 5 дней (день -5)
          { stageCode: 'production', status: 'in_progress', plannedDate: day(1), contractor: { companyName: 'ТК Восток' } },
          { stageCode: 'delivery', status: 'not_started', plannedDate: day(-5), contractor: null },
        ],
      }),
      stageNames,
      TODAY_UTC
    )
    expect(row.nearestStageName).toBe('Производство')
    expect(row.nearestStageStatus).toBe('in_progress')
    expect(row.contractorName).toBe('ТК Восток')
    // ETA = МАКСИМАЛЬНАЯ плановая дата незавершённых (calcOrderEta):
    // дальний этап определяет финал, не просроченный ближний.
    expect(row.eta).toBe(day(-5).toISOString())
    expect(row.overdue).toBe(true)
  })

  it('все этапы завершены — ETA null (доставлено)', () => {
    const row = buildCargoRow(
      cargoOrder({
        stages: [{ stageCode: 'production', status: 'done', plannedDate: day(-3), contractor: null }],
      }),
      stageNames,
      TODAY_UTC
    )
    expect(row.nearestStageName).toBeNull()
    expect(row.eta).toBeNull()
    expect(row.overdue).toBe(false)
  })

  it('этапов нет — строка с прочерками, без падения', () => {
    const row = buildCargoRow(cargoOrder(), stageNames, TODAY_UTC)
    expect(row.nearestStageName).toBeNull()
    expect(row.eta).toBeNull()
    expect(row.contractorName).toBeNull()
  })

  it('клиент без компании — прочерк (ручная заявка)', () => {
    const row = buildCargoRow(cargoOrder({ customer: null }), stageNames, TODAY_UTC)
    expect(row.customerName).toBe('—')
  })

  it('план на сегодня — не просрочка (правило Ж4/Ж5: UTC-полночь)', () => {
    const row = buildCargoRow(
      cargoOrder({
        stages: [{ stageCode: 'delivery', status: 'in_progress', plannedDate: new Date(TODAY_UTC), contractor: null }],
      }),
      stageNames,
      TODAY_UTC
    )
    expect(row.overdue).toBe(false)
    expect(row.eta).toBe(new Date(TODAY_UTC).toISOString())
  })
})

describe('groupSlowingOrders («Кто тормозит»: группировка по waitingOnKind)', () => {
  const slowing = (over: Partial<SlowingOrderInput>): SlowingOrderInput => ({
    id: 'o1',
    number: '17-1',
    customer: { name: 'ООО «Ромашка»' },
    waitingOnKind: 'none',
    waitingReason: null,
    waitingSince: null,
    ...over,
  })

  it('kind none и NULL waitingSince не участвуют', () => {
    const groups = groupSlowingOrders(
      [slowing({ waitingOnKind: 'none', waitingSince: day(-2) }), slowing({ waitingOnKind: 'client', waitingSince: null })],
      PULSE_SLOWING_GROUP_LIMIT
    )
    expect(groups).toEqual([])
  })

  it('две группы, самые старые сверху; внутри — по возрасту', () => {
    const groups = groupSlowingOrders(
      [
        slowing({ id: 'a', waitingOnKind: 'client', waitingSince: day(2) }),
        slowing({ id: 'b', waitingOnKind: 'manager', waitingSince: day(5) }),
        slowing({ id: 'c', waitingOnKind: 'client', waitingSince: day(1) }),
      ],
      PULSE_SLOWING_GROUP_LIMIT
    )
    expect(groups.map((g) => g.kind)).toEqual(['manager', 'client'])
    expect(groups[0].oldestSince).toBe(day(5).toISOString())
    expect(groups[1].orders.map((o) => o.orderId)).toEqual(['a', 'c'])
  })

  it('счётчик полный, список — лимитом, скрытые считаются', () => {
    const rows = Array.from({ length: 25 }, (_, i) =>
      slowing({ id: `o${i}`, waitingOnKind: 'client', waitingSince: day(i % 3) })
    )
    const groups = groupSlowingOrders(rows, 20)
    expect(groups).toHaveLength(1)
    expect(groups[0].count).toBe(25)
    expect(groups[0].orders).toHaveLength(20)
    expect(groups[0].hiddenCount).toBe(5)
  })

  it('неизвестный kind отброшен (защита от мусора в колонке)', () => {
    const groups = groupSlowingOrders([slowing({ waitingOnKind: 'alien', waitingSince: day(-1) })], 20)
    expect(groups).toEqual([])
  })

  it('равный возраст групп — приоритет: менеджер раньше внешних', () => {
    const at = day(-2)
    const groups = groupSlowingOrders(
      [
        slowing({ waitingOnKind: 'contractor', waitingSince: at }),
        slowing({ waitingOnKind: 'client', waitingSince: at }),
        slowing({ waitingOnKind: 'manager', waitingSince: at }),
        slowing({ waitingOnKind: 'broker', waitingSince: at }),
      ],
      PULSE_SLOWING_GROUP_LIMIT
    )
    expect(groups.map((g) => g.kind)).toEqual(['manager', 'client', 'broker', 'contractor'])
  })

  it('клиент без компании — прочерк в раскрытии', () => {
    const groups = groupSlowingOrders(
      [slowing({ customer: null, waitingOnKind: 'client', waitingSince: day(-1) })],
      PULSE_SLOWING_GROUP_LIMIT
    )
    expect(groups[0].orders[0].customerName).toBe('—')
  })

  it('пустой вход — пустой список', () => {
    expect(groupSlowingOrders([], PULSE_SLOWING_GROUP_LIMIT)).toEqual([])
  })
})
