import { describe, expect, it } from 'vitest'
import { suggestOrderStatus } from '@/lib/status-suggest'
import type { StageStatus } from '@/lib/order-constants'

// DF-06: матрица подсказок статуса заявки по этапам.
// Кардинальность: подсказка ТОЛЬКО когда матрица переходов разрешает.

const stages = (statuses: StageStatus[]) => statuses.map((status) => ({ status }))

const ALL_DONE = stages(['done', 'done', 'done', 'done', 'done', 'done'])
const ALL_NOT_STARTED = stages(['not_started', 'not_started', 'not_started', 'not_started', 'not_started', 'not_started'])
const WORK_IN_PROGRESS = stages(['done', 'in_progress', 'not_started', 'not_started', 'not_started', 'not_started'])
const HAS_PROBLEM = stages(['done', 'problem', 'not_started', 'not_started', 'not_started', 'not_started'])

describe('suggestOrderStatus — завершение (все этапы done)', () => {
  it('in_progress → подсказка «Завершить заявку» (переход разрешён)', () => {
    expect(suggestOrderStatus(ALL_DONE, 'in_progress')).toEqual({
      to: 'completed',
      question: 'Все этапы завершены — завершить заявку?',
      button: 'Завершить заявку',
    })
  })

  it('приоритет: все done + in_progress предлагает completed, а не in_progress', () => {
    const s = suggestOrderStatus(ALL_DONE, 'in_progress')
    expect(s?.to).toBe('completed')
  })

  it('calculating → completed не разрешён, лестница через «В работе»', () => {
    expect(suggestOrderStatus(ALL_DONE, 'calculating')).toEqual({
      to: 'in_progress',
      question: 'Работа началась — перевести в «В работе»?',
      button: 'Перевести в «В работе»',
    })
  })

  it('confirmed → completed не разрешён, лестница через «В работе»', () => {
    expect(suggestOrderStatus(ALL_DONE, 'confirmed')?.to).toBe('in_progress')
  })

  it('completed — терминальный, подсказки нет', () => {
    expect(suggestOrderStatus(ALL_DONE, 'completed')).toBeNull()
  })

  it('cancelled — терминальный, подсказки нет', () => {
    expect(suggestOrderStatus(ALL_DONE, 'cancelled')).toBeNull()
  })
})

describe('suggestOrderStatus — начало работы', () => {
  it('есть in_progress + calculating → «В работе»', () => {
    expect(suggestOrderStatus(WORK_IN_PROGRESS, 'calculating')).toEqual({
      to: 'in_progress',
      question: 'Работа началась — перевести в «В работе»?',
      button: 'Перевести в «В работе»',
    })
  })

  it('есть in_progress + confirmed → «В работе»', () => {
    expect(suggestOrderStatus(WORK_IN_PROGRESS, 'confirmed')?.to).toBe('in_progress')
  })

  it('уже in_progress — подсказки нет (завершать рано, статус уже верный)', () => {
    expect(suggestOrderStatus(WORK_IN_PROGRESS, 'in_progress')).toBeNull()
  })

  it('этап с problem = работа началась + calculating → «В работе»', () => {
    expect(suggestOrderStatus(HAS_PROBLEM, 'calculating')?.to).toBe('in_progress')
  })

  it('этап с problem + in_progress → null', () => {
    expect(suggestOrderStatus(HAS_PROBLEM, 'in_progress')).toBeNull()
  })

  it('один done без активных + calculating → «В работе» (работа шла)', () => {
    const s = suggestOrderStatus(stages(['done', 'not_started', 'not_started']), 'calculating')
    expect(s?.to).toBe('in_progress')
  })

  it('смешанный (done + in_progress + not_started) + confirmed → «В работе»', () => {
    expect(suggestOrderStatus(WORK_IN_PROGRESS, 'confirmed')?.to).toBe('in_progress')
  })
})

describe('suggestOrderStatus — работы не было', () => {
  it('все not_started + calculating → null', () => {
    expect(suggestOrderStatus(ALL_NOT_STARTED, 'calculating')).toBeNull()
  })

  it('все not_started + confirmed → null', () => {
    expect(suggestOrderStatus(ALL_NOT_STARTED, 'confirmed')).toBeNull()
  })

  it('все not_started + in_progress → null', () => {
    expect(suggestOrderStatus(ALL_NOT_STARTED, 'in_progress')).toBeNull()
  })
})

describe('suggestOrderStatus — границы', () => {
  it('пустой список этапов → null', () => {
    expect(suggestOrderStatus([], 'in_progress')).toBeNull()
    expect(suggestOrderStatus([], 'calculating')).toBeNull()
  })

  it('пустой список не ломает терминальные статусы', () => {
    expect(suggestOrderStatus([], 'completed')).toBeNull()
  })
})
