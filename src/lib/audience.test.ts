import { describe, it, expect } from 'vitest'
import { AUDIENCES, eventWhereFor, canSeeDocument, documentEventAudience } from './audience'

// ─── DF-01: видимость событий — unit lib/audience.ts ────────────────
// Единственная точка расчёта видимости лент: значения проверяются
// дословно — здесь фиксируется контракт, на котором строятся кабинеты
// (Ж2) и будущие уведомления (DF-03). Смена вида фрагмента = осознанная
// правка этого теста, а не тихое изменение поведения.

describe('audience.ts (DF-01)', () => {
  describe('eventWhereFor', () => {
    it('staff видит всё — пустой фрагмент (как работали три админские ленты до DF-01)', () => {
      expect(eventWhereFor('staff')).toEqual({})
    })

    it('client: не внутреннее + адресовано клиенту', () => {
      expect(eventWhereFor('client')).toEqual({
        isInternal: false,
        audience: { has: 'client' },
      })
    })

    it('broker: не внутреннее + адресовано брокеру', () => {
      expect(eventWhereFor('broker')).toEqual({
        isInternal: false,
        audience: { has: 'broker' },
      })
    })

    it('AUDIENCES — канонический порядок; contractor не аудитория (D31)', () => {
      // Порядок в AUDIENCES определяет каноническую запись audience в БД
      // (нормализация emitEvent идёт по этому списку) — менять его
      // нельзя без миграции существующих строк.
      expect([...AUDIENCES]).toEqual(['staff', 'client', 'broker'])
    })
  })

  describe('canSeeDocument', () => {
    it('внутренний документ видит только staff', () => {
      const doc = { isInternal: true }
      expect(canSeeDocument('staff', doc)).toBe(true)
      expect(canSeeDocument('client', doc)).toBe(false)
      expect(canSeeDocument('broker', doc)).toBe(false)
    })

    it('внешний документ видят все три аудитории', () => {
      const doc = { isInternal: false }
      expect(canSeeDocument('staff', doc)).toBe(true)
      expect(canSeeDocument('client', doc)).toBe(true)
      expect(canSeeDocument('broker', doc)).toBe(true)
    })
  })

  describe('documentEventAudience', () => {
    it('событие внутреннего документа — staff-only (кабинет не узнаёт о факте существования)', () => {
      expect(documentEventAudience(true)).toEqual(['staff'])
    })

    it('событие внешнего документа — все три аудитории', () => {
      expect(documentEventAudience(false)).toEqual(['staff', 'client', 'broker'])
    })
  })
})
