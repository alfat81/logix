import { describe, it, expect } from 'vitest'
import {
  CHOICE_FOLLOWUP_BUSINESS_DAYS,
  computeWaitingLead,
  computeWaitingOrder,
  isChoiceFollowupDue,
  isStageOverdue,
  nearestUnfinishedStage,
  WAITING_REASON_LABELS,
  type WaitingBrokerSnapshot,
  type WaitingLeadSnapshot,
  type WaitingOrderSnapshot,
  type WaitingStageSnapshot,
} from '@/lib/waiting'

// ─── DF-05: таблица правил «У кого мяч» ──────────────────────────────
// Каждый кейс — строка таблицы приоритетов карточки: побеждает первое
// сработавшее правило. todayUtc фиксирован: 2 ноября 2026, UTC-полночь.

const TODAY = new Date(Date.UTC(2026, 10, 2))
const YESTERDAY = new Date(Date.UTC(2026, 10, 1))
const TOMORROW = new Date(Date.UTC(2026, 10, 3))

function stage(
  seq: number,
  status: string,
  contractorId: string | null = null,
  plannedDate: Date | null = null
): WaitingStageSnapshot {
  return { sequence: seq, status, contractorId, plannedDate }
}

function brokers(...args: (string | boolean)[]): WaitingBrokerSnapshot[] {
  const out: WaitingBrokerSnapshot[] = []
  for (let i = 0; i < args.length; i += 2) {
    out.push({ brokerId: args[i] as string, hasEstimate: args[i + 1] as boolean })
  }
  return out
}

function orderSnap(over: Partial<WaitingOrderSnapshot>): WaitingOrderSnapshot {
  return {
    status: 'in_progress',
    customerId: 'c1',
    assignedToId: 'm1',
    stages: [],
    brokers: [],
    ...over,
  }
}

describe('computeWaitingOrder (DF-05, заявка)', () => {
  it('1. completed → мяча нет', () => {
    expect(computeWaitingOrder(orderSnap({ status: 'completed' }), TODAY)).toEqual({
      kind: 'none',
      reason: null,
      onId: null,
    })
  })

  it('1. cancelled → мяча нет (даже с проблемным этапом)', () => {
    expect(
      computeWaitingOrder(
        orderSnap({ status: 'cancelled', stages: [stage(1, 'problem')] }),
        TODAY
      )
    ).toEqual({ kind: 'none', reason: null, onId: null })
  })

  it('2. любой этап в проблеме → менеджер, stage_problem', () => {
    expect(
      computeWaitingOrder(
        orderSnap({ stages: [stage(1, 'in_progress', 'k1', TOMORROW), stage(2, 'problem')] }),
        TODAY
      )
    ).toEqual({ kind: 'manager', reason: 'stage_problem', onId: 'm1' })
  })

  it('3. calculating → менеджер (сильнее неназначенного этапа)', () => {
    expect(
      computeWaitingOrder(
        orderSnap({ status: 'calculating', stages: [stage(1, 'not_started')] }),
        TODAY
      )
    ).toEqual({ kind: 'manager', reason: 'calculating', onId: 'm1' })
  })

  it('4. confirmed → клиент, awaiting_client_approval, id = customerId', () => {
    expect(computeWaitingOrder(orderSnap({ status: 'confirmed' }), TODAY)).toEqual({
      kind: 'client',
      reason: 'awaiting_client_approval',
      onId: 'c1',
    })
  })

  it('5. брокер без оценки → брокер (оценка через связь лида)', () => {
    expect(
      computeWaitingOrder(orderSnap({ brokers: brokers('b1', false) }), TODAY)
    ).toEqual({ kind: 'broker', reason: 'awaiting_broker_estimate', onId: 'b1' })
  })

  it('5. брокер с оценкой (черновик считается ответом) — правило не срабатывает', () => {
    expect(
      computeWaitingOrder(orderSnap({ brokers: brokers('b1', true) }), TODAY).kind
    ).toBe('none')
  })

  it('приоритет: calculating сильнее брокера без оценки', () => {
    expect(
      computeWaitingOrder(
        orderSnap({ status: 'calculating', brokers: brokers('b1', false) }),
        TODAY
      ).reason
    ).toBe('calculating')
  })

  it('6. ближайший этап без исполнителя → менеджер, stage_unassigned', () => {
    expect(
      computeWaitingOrder(orderSnap({ stages: [stage(1, 'not_started')] }), TODAY)
    ).toEqual({ kind: 'manager', reason: 'stage_unassigned', onId: 'm1' })
  })

  it('6. незавершённый этап ищется ПОСЛЕ done-этапов (по sequence)', () => {
    const nearest = nearestUnfinishedStage([
      stage(1, 'done'),
      stage(2, 'not_started'),
      stage(3, 'in_progress', 'k1'),
    ])
    expect(nearest?.sequence).toBe(2)
  })

  it('6б. просроченный план этапа → менеджер, stage_overdue_followup', () => {
    expect(
      computeWaitingOrder(
        orderSnap({ stages: [stage(1, 'in_progress', 'k1', YESTERDAY)] }),
        TODAY
      )
    ).toEqual({ kind: 'manager', reason: 'stage_overdue_followup', onId: 'm1' })
  })

  it('6б. план на сегодня — НЕ просрочка (та же семантика, что Ж5)', () => {
    expect(
      isStageOverdue(stage(1, 'in_progress', 'k1', TODAY), TODAY)
    ).toBe(false)
    expect(
      computeWaitingOrder(
        orderSnap({ stages: [stage(1, 'in_progress', 'k1', TODAY)] }),
        TODAY
      ).reason
    ).toBe('stage_in_progress')
  })

  it('7. этап у перевозчика в срок → contractor + статус этапа', () => {
    expect(
      computeWaitingOrder(
        orderSnap({ stages: [stage(1, 'in_progress', 'k1', TOMORROW)] }),
        TODAY
      )
    ).toEqual({ kind: 'contractor', reason: 'stage_in_progress', onId: 'k1' })
    expect(
      computeWaitingOrder(
        orderSnap({ stages: [stage(1, 'not_started', 'k1', TOMORROW)] }),
        TODAY
      ).reason
    ).toBe('stage_not_started')
  })

  it('2 сильнее 7: проблема дальнего этапа выносит мяч у этапа в работе', () => {
    expect(
      computeWaitingOrder(
        orderSnap({
          stages: [stage(1, 'in_progress', 'k1', TOMORROW), stage(2, 'problem')],
        }),
        TODAY
      ).reason
    ).toBe('stage_problem')
  })

  it('все этапы завершены, брокеры с оценками → мяча нет', () => {
    expect(
      computeWaitingOrder(
        orderSnap({ stages: [stage(1, 'done')], brokers: brokers('b1', true) }),
        TODAY
      ).kind
    ).toBe('none')
  })

  it('активная заявка без этапов (ручная Б3) → фолбэк «мяча нет»', () => {
    expect(computeWaitingOrder(orderSnap({}), TODAY).kind).toBe('none')
  })
})

describe('computeWaitingLead (DF-05, запрос)', () => {
  function leadSnap(over: Partial<WaitingLeadSnapshot> = {}): WaitingLeadSnapshot {
    return {
      status: 'new',
      customerId: 'c1',
      cargoName: null,
      hasInvoiceDoc: false,
      brokers: [],
      optionsCount: 0,
      hasSelectedOption: false,
      ...over,
    }
  }

  it('won/lost — терминальные, мяча нет', () => {
    expect(computeWaitingLead(leadSnap({ status: 'won' })).kind).toBe('none')
    expect(computeWaitingLead(leadSnap({ status: 'lost' })).kind).toBe('none')
  })

  it('нет проформы и описания → клиент, awaiting_proforma', () => {
    expect(computeWaitingLead(leadSnap())).toEqual({
      kind: 'client',
      reason: 'awaiting_proforma',
      onId: 'c1',
    })
  })

  it('описание товара есть → дальше по цепочке (менеджер, no_quote)', () => {
    expect(computeWaitingLead(leadSnap({ cargoName: 'Станок' })).reason).toBe('no_quote')
  })

  it('инвойс-документ вместо описания — тоже проходит', () => {
    expect(computeWaitingLead(leadSnap({ hasInvoiceDoc: true })).reason).toBe('no_quote')
  })

  it('приоритет: без описания клиент сильнее брокера без оценки', () => {
    expect(
      computeWaitingLead(leadSnap({ brokers: brokers('b1', false) })).reason
    ).toBe('awaiting_proforma')
  })

  it('описание есть, брокер без оценки → брокер', () => {
    expect(
      computeWaitingLead(leadSnap({ cargoName: 'Станок', brokers: brokers('b1', false) }))
    ).toEqual({ kind: 'broker', reason: 'awaiting_broker_estimate', onId: 'b1' })
  })

  it('брокеры ответили, вариантов нет → менеджер, no_quote (сильнее правила 4)', () => {
    expect(
      computeWaitingLead(
        leadSnap({ cargoName: 'Станок', brokers: brokers('b1', true), optionsCount: 0 })
      ).reason
    ).toBe('no_quote')
  })

  it("4 (D45). несколько вариантов (2) и выбранного нет → клиент, awaiting_client_choice (закрыт открытый вопрос карточки 0.7.2)", () => {
    expect(
      computeWaitingLead(
        leadSnap({ cargoName: 'Станок', brokers: brokers('b1', true), optionsCount: 2 })
      )
    ).toEqual({ kind: 'client', reason: 'awaiting_client_choice', onId: 'c1' })
  })

  it("4 (D45). выбранного нет, вариантов 3 — то же (id = customerId)", () => {
    const out = computeWaitingLead(
      leadSnap({ cargoName: 'Станок', optionsCount: 3, brokers: brokers('b1', true) })
    )
    expect(out.reason).toBe('awaiting_client_choice')
    expect(out.onId).toBe('c1')
  })

  it("4 (D45). вариант выбран → правило не срабатывает (мяча нет, обычная цепочка)", () => {
    expect(
      computeWaitingLead(
        leadSnap({
          cargoName: 'Станок',
          brokers: brokers('b1', true),
          optionsCount: 2,
          hasSelectedOption: true,
        })
      )
    ).toEqual({ kind: 'none', reason: null, onId: null })
  })

  it("4 (D45). ОДИН вариант без выбора — правило не срабатывает (буква D45: «несколько» = ≥2; осознанная неполнота)", () => {
    expect(
      computeWaitingLead(
        leadSnap({ cargoName: 'Станок', brokers: brokers('b1', true), optionsCount: 1 })
      )
    ).toEqual({ kind: 'none', reason: null, onId: null })
  })

  it("4 (D45). выбор снимает ожидание: 2 варианта, selected=true → none (пересчёт на PATCH isSelected)", () => {
    const before = computeWaitingLead(
      leadSnap({ cargoName: 'Станок', optionsCount: 2 })
    )
    const after = computeWaitingLead(
      leadSnap({ cargoName: 'Станок', optionsCount: 2, hasSelectedOption: true })
    )
    expect(before.kind).toBe('client')
    expect(after.kind).toBe('none')
  })

  it("приоритет: awaiting_proforma сильнее правила 4 (без описания — ждём материалы)", () => {
    expect(
      computeWaitingLead(
        leadSnap({ optionsCount: 2, brokers: brokers('b1', true) })
      ).reason
    ).toBe('awaiting_proforma')
  })

  it("подписи причин: awaiting_client_choice есть в WAITING_REASON_LABELS (компилятор + smoke)", () => {
    expect(WAITING_REASON_LABELS.awaiting_client_choice).toBe('Ждём выбор варианта расчёта')
  })

  it("D45: эскалация — порог 2 рабочих дня (константа и граничные значения)", () => {
    expect(CHOICE_FOLLOWUP_BUSINESS_DAYS).toBe(2)
    // Якорь — среда 12:00 UTC (15:00 МСК): чт — 1-й рабочий день, пт 00:00 МСК — второй.
    const wed = new Date(Date.UTC(2026, 9, 28, 12, 0, 0)) // ср
    const thu = new Date(Date.UTC(2026, 9, 29, 12, 0, 0)) // чт — сутки спустя, 1 р.д.
    const fri = new Date(Date.UTC(2026, 9, 30, 9, 0, 0)) // пт 12:00 МСК — 2 р.д.
    expect(isChoiceFollowupDue(wed, thu)).toBe(false)
    expect(isChoiceFollowupDue(wed, fri)).toBe(true)
  })
})
