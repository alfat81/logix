import { describe, expect, it } from 'vitest'
import {
  BrokerEstimateFullSchema,
  EstimateItemSchema,
  diffEstimateItems,
  fmtPercent,
  isManualRate,
} from './brokers'

// ─── DF-18: строки ответа брокера — валидация и diff (карточка: unit) ─

const ITEM = {
  hsCode: '0101210000',
  dutyPercent: 5,
  addDutyPercent: null,
  addDutyNote: null,
  vatPercent: 20,
  rateNote: null,
}

describe('EstimateItemSchema (DF-18)', () => {
  it('валидная строка: код 10 цифр + проценты', () => {
    const r = EstimateItemSchema.safeParse(ITEM)
    expect(r.success).toBe(true)
  })

  it('код — ровно 10 цифр: 9 и 11 цифр и буквы отвергаются', () => {
    expect(EstimateItemSchema.safeParse({ ...ITEM, hsCode: '010121000' }).success).toBe(false)
    expect(EstimateItemSchema.safeParse({ ...ITEM, hsCode: '01012100000' }).success).toBe(false)
    expect(EstimateItemSchema.safeParse({ ...ITEM, hsCode: '0101 21' }).success).toBe(false)
    expect(EstimateItemSchema.safeParse({ ...ITEM, hsCode: '0101A10000' }).success).toBe(false)
  })

  it('проценты в разумных границах: 0 и 100 ок, за границей — нет', () => {
    expect(EstimateItemSchema.safeParse({ ...ITEM, dutyPercent: 0 }).success).toBe(true)
    expect(EstimateItemSchema.safeParse({ ...ITEM, dutyPercent: 100 }).success).toBe(true)
    expect(EstimateItemSchema.safeParse({ ...ITEM, dutyPercent: 100.01 }).success).toBe(false)
    expect(EstimateItemSchema.safeParse({ ...ITEM, dutyPercent: -1 }).success).toBe(false)
    expect(EstimateItemSchema.safeParse({ ...ITEM, vatPercent: 101 }).success).toBe(false)
  })

  it('проценты — максимум 2 знака после запятой', () => {
    expect(EstimateItemSchema.safeParse({ ...ITEM, dutyPercent: 5.5 }).success).toBe(true)
    expect(EstimateItemSchema.safeParse({ ...ITEM, dutyPercent: 5.25 }).success).toBe(true)
    expect(EstimateItemSchema.safeParse({ ...ITEM, dutyPercent: 5.255 }).success).toBe(false)
  })

  it('пустые проценты = «не указано», null допустим', () => {
    expect(
      EstimateItemSchema.safeParse({ hsCode: '0301920000', dutyPercent: null, vatPercent: null })
        .success,
    ).toBe(true)
  })

  it('примечания ограничены по длине', () => {
    const long = 'а'.repeat(201)
    expect(EstimateItemSchema.safeParse({ ...ITEM, addDutyNote: long }).success).toBe(false)
    expect(EstimateItemSchema.safeParse({ ...ITEM, rateNote: long }).success).toBe(false)
  })
})

describe('BrokerEstimateFullSchema — контракт не сломан (G2)', () => {
  it('старый ответ (только сумма и список) валиден без новых полей', () => {
    const r = BrokerEstimateFullSchema.safeParse({
      customsDutyEstimate: 85000.5,
      requiredPermits: ['Сертификат соответствия'],
      notes: 'примечание',
    })
    expect(r.success).toBe(true)
  })

  it('items и send — новые необязательные поля', () => {
    const r = BrokerEstimateFullSchema.safeParse({ items: [ITEM], send: true })
    expect(r.success).toBe(true)
  })

  it('жёсткий потолок строк схемы (200) — больше отвергается', () => {
    const many = Array.from({ length: 201 }, (_, i) => ({
      ...ITEM,
      hsCode: String(i).padStart(10, '0'),
    }))
    expect(BrokerEstimateFullSchema.safeParse({ items: many }).success).toBe(false)
  })

  it('код-дубль в строках не отсекается схемой — проверяет роут', () => {
    // Схема не знает про дубли (это бизнес-правило), роут возвращает 400:
    // здесь фиксируем только, что schema пропускает два одинаковых кода.
    const dup = { items: [ITEM, { ...ITEM }] }
    expect(BrokerEstimateFullSchema.safeParse(dup).success).toBe(true)
  })
})

describe('isManualRate (DF-18: строка считается вручную)', () => {
  it('строка с rateNote помечается ручной', () => {
    expect(isManualRate({ rateNote: '2 €/кг' })).toBe(true)
    expect(isManualRate({ rateNote: 'от 0,1 до 2,1 €/кг' })).toBe(true)
  })

  it('без rateNote / пустой / пробельный — не ручная', () => {
    expect(isManualRate({ rateNote: null })).toBe(false)
    expect(isManualRate({ rateNote: '' })).toBe(false)
    expect(isManualRate({ rateNote: '   ' })).toBe(false)
    expect(isManualRate({})).toBe(false)
    expect(isManualRate(null)).toBe(false)
    expect(isManualRate(undefined)).toBe(false)
  })
})

describe('fmtPercent', () => {
  it('нули после запятой отбрасываются, точка → запятая', () => {
    expect(fmtPercent('5.00')).toBe('5')
    expect(fmtPercent('12.50')).toBe('12,5')
    expect(fmtPercent(20)).toBe('20')
    expect(fmtPercent(0)).toBe('0')
  })
  it('null/пустое — прочерк', () => {
    expect(fmtPercent(null)).toBe('—')
    expect(fmtPercent(undefined)).toBe('—')
    expect(fmtPercent('')).toBe('—')
  })
})

describe('diffEstimateItems (правки после отправки — событие с разницей)', () => {
  it('добавленная строка — «+ код (пошлина / доп / НДС)»', () => {
    const diff = diffEstimateItems([], [{ hsCode: '0101210000', dutyPercent: 5, vatPercent: 20 }])
    expect(diff).toBe('+ 0101210000 (5 / — / 20)')
  })

  it('убранная строка — «− код»', () => {
    const diff = diffEstimateItems([{ hsCode: '0301920000' }], [])
    expect(diff).toBe('− 0301920000')
  })

  it('изменённые проценты — только изменившиеся поля, старое→новое', () => {
    const diff = diffEstimateItems(
      [
        { hsCode: '0101210000', dutyPercent: 5, addDutyPercent: null, vatPercent: 20 },
        { hsCode: '8501100000', dutyPercent: 0, addDutyPercent: null, vatPercent: 20 },
      ],
      [
        { hsCode: '0101210000', dutyPercent: 10, addDutyPercent: null, vatPercent: 20 },
        { hsCode: '8501100000', dutyPercent: 0, addDutyPercent: 5, vatPercent: 10 },
      ],
    )
    expect(diff).toBe('0101210000: пошлина 5→10; 8501100000: доп. пошлина —→5, НДС 20→10')
  })

  it('без изменений строк — пустая строка (роут пишет «итог/примечания»)', () => {
    const items = [{ hsCode: '0101210000', dutyPercent: 5, vatPercent: 20 }]
    expect(diffEstimateItems(items, items)).toBe('')
  })

  it('Decimal из API (строки) сравниваются с числами стабильно', () => {
    // Prisma Decimal сериализуется строкой: '5.00' vs 5 — не изменение
    const diff = diffEstimateItems(
      [{ hsCode: '0101210000', dutyPercent: '5.00' as const, vatPercent: 20 }],
      [{ hsCode: '0101210000', dutyPercent: 5, vatPercent: 20 }],
    )
    expect(diff).toBe('')
  })
})
