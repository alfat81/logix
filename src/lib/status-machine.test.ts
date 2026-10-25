import { describe, expect, it } from 'vitest'
import {
  LEAD_STATUSES,
  LEAD_STATUS_LABELS,
} from '@/lib/leads'
import {
  ORDER_STATUSES,
  ORDER_STATUS_LABELS,
} from '@/lib/order-constants'
import {
  LEAD_TRANSITIONS,
  ORDER_TRANSITIONS,
  TERMINAL_ORDER_STATUSES,
  allowedLeadTransitionsLabeled,
  allowedOrderTransitionsLabeled,
  checkLeadTransition,
  checkOrderTransition,
} from '@/lib/status-machine'

// P1-05: матрица переходов — приёмка требует unit-покрытия. Две линии
// защиты: (1) полный перебор N×N — checkXxxTransition разрешает ровно
// то, что записано в таблице, «забыть» запрет невозможно; (2) сценарные
// тесты фиксируют бизнес-ожидания роадмапа независимо от реализации.

describe('Матрица переходов заявки (ORDER_TRANSITIONS)', () => {
  it('полный перебор 5×5: разрешён ровно входящий в таблицу переход', () => {
    for (const from of ORDER_STATUSES) {
      for (const to of ORDER_STATUSES) {
        const res = checkOrderTransition(from, to)
        expect(res.ok).toBe(ORDER_TRANSITIONS[from].includes(to))
      }
    }
  })

  it('канонический путь Расчёт → Согласование → В работе → Завершена разрешён', () => {
    expect(checkOrderTransition('calculating', 'confirmed').ok).toBe(true)
    expect(checkOrderTransition('confirmed', 'in_progress').ok).toBe(true)
    expect(checkOrderTransition('in_progress', 'completed').ok).toBe(true)
  })

  it('перепрыгивание согласования (calculating → in_progress) разрешено', () => {
    expect(checkOrderTransition('calculating', 'in_progress').ok).toBe(true)
  })

  it('«Отменена» доступна из любого не-терминального статуса', () => {
    for (const from of ORDER_STATUSES) {
      if (!(TERMINAL_ORDER_STATUSES as readonly string[]).includes(from)) {
        expect(ORDER_TRANSITIONS[from]).toContain('cancelled')
      }
    }
  })

  it('из терминальных возврат только в «В работе», прямой переход запрещён', () => {
    for (const terminal of TERMINAL_ORDER_STATUSES) {
      expect(ORDER_TRANSITIONS[terminal]).toEqual(['in_progress'])
      expect(checkOrderTransition(terminal, 'calculating').ok).toBe(false)
      expect(checkOrderTransition(terminal, 'confirmed').ok).toBe(false)
      expect(checkOrderTransition(terminal, 'completed').ok).toBe(false)
      expect(checkOrderTransition(terminal, 'cancelled').ok).toBe(false)
    }
  })

  it('назад в «Расчёт» из работы и согласования — нельзя', () => {
    expect(checkOrderTransition('in_progress', 'calculating').ok).toBe(false)
    expect(checkOrderTransition('confirmed', 'calculating').ok).toBe(false)
  })

  it('повтор статуса — 400, запрещённый переход — 409, с текстом для человека', () => {
    expect(checkOrderTransition('in_progress', 'in_progress')).toMatchObject({ ok: false, status: 400 })
    const reject = checkOrderTransition('calculating', 'completed')
    expect(reject).toMatchObject({ ok: false, status: 409 })
    if (!reject.ok) expect(reject.error).toContain('В работе')
  })
})

describe('Матрица переходов запроса (LEAD_TRANSITIONS)', () => {
  it('полный перебор 4×4: разрешён ровно входящий в таблицу переход', () => {
    for (const from of LEAD_STATUSES) {
      for (const to of LEAD_STATUSES) {
        const res = checkLeadTransition(from, to)
        expect(res.ok).toBe(LEAD_TRANSITIONS[from].includes(to))
      }
    }
  })

  it('«Выигран» — строго терминальный: из него и в него вручную нельзя', () => {
    expect(LEAD_TRANSITIONS.won).toEqual([])
    for (const from of LEAD_STATUSES) {
      if (from !== 'won') expect(LEAD_TRANSITIONS[from]).not.toContain('won')
    }
  })

  it('«Отказ» возвращает только в «Новый»; calculated → new закрыт', () => {
    expect(checkLeadTransition('lost', 'new').ok).toBe(true)
    expect(checkLeadTransition('calculated', 'new').ok).toBe(false)
    expect(checkLeadTransition('lost', 'calculated').ok).toBe(false)
  })

  it('new → calculated разрешён матрицей (порог «≥1 вариант» проверяет роут)', () => {
    expect(checkLeadTransition('new', 'calculated').ok).toBe(true)
  })
})

describe('Проекции для UI (подписи переходов)', () => {
  it('списки для UI совпадают с таблицей и несут подписи из словаря', () => {
    for (const from of ORDER_STATUSES) {
      expect(allowedOrderTransitionsLabeled(from)).toEqual(
        ORDER_TRANSITIONS[from].map((status) => ({ status, label: ORDER_STATUS_LABELS[status] }))
      )
    }
    for (const from of LEAD_STATUSES) {
      expect(allowedLeadTransitionsLabeled(from)).toEqual(
        LEAD_TRANSITIONS[from].map((status) => ({ status, label: LEAD_STATUS_LABELS[status] }))
      )
    }
  })
})
