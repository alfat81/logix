import { describe, expect, it } from 'vitest'
import {
  sumOptionCalc,
  computeAmountOffer,
  calcMismatch,
  isOptionCalcArticle,
  OPTION_CALC_ARTICLES,
} from './option-calc'

// DF-27 волна 1 (план v1.2 §5): строки расчёта варианта. Деньги —
// целыми сотыми (RULES 2.15, без float-дрейфа), приведение к валюте
// предложения — amountOffer, иначе amount × fxRateToOffer (округление
// до 2 знаков), строка без курса не приводится (итог её не считает).

describe('OPTION_CALC_ARTICLES (реестр статей)', () => {
  it('восемь статей плана §5.1', () => {
    expect([...OPTION_CALC_ARTICLES].sort()).toEqual(
      ['broker', 'customs', 'freight', 'handling', 'insurance', 'lastMile', 'other', 'terminal'].sort()
    )
  })
  it('isOptionCalcArticle — только статьи реестра', () => {
    expect(isOptionCalcArticle('freight')).toBe(true)
    expect(isOptionCalcArticle('доставка')).toBe(false)
    expect(isOptionCalcArticle(null)).toBe(false)
  })
})

describe('sumOptionCalc', () => {
  it('строки в валюте предложения — как есть', () => {
    const t = sumOptionCalc(
      [
        { amount: 1000, currency: 'RUB', fxRateToOffer: null, amountOffer: null },
        { amount: 250.5, currency: 'RUB', fxRateToOffer: null, amountOffer: null },
      ],
      'RUB'
    )
    expect(t.total).toBe(1250.5)
    expect(t.byArticle['other']).toBe(1250.5)
  })

  it('по статьям агрегирует, неизвестная статья → other', () => {
    const t = sumOptionCalc(
      [
        { amount: 500, currency: 'RUB', fxRateToOffer: null, amountOffer: null, article: 'freight' },
        { amount: 300, currency: 'RUB', fxRateToOffer: null, amountOffer: null, article: 'customs' },
        { amount: 200, currency: 'RUB', fxRateToOffer: null, amountOffer: null, article: 'неизвестная' },
      ],
      'RUB'
    )
    expect(t.byArticle).toEqual({ freight: 500, customs: 300, other: 200 })
    expect(t.total).toBe(1000)
  })

  it('чужая валюта: явный amountOffer приоритетнее курса', () => {
    const t = sumOptionCalc(
      [{ amount: 100, currency: 'USD', fxRateToOffer: 90, amountOffer: 9500, article: 'customs' }],
      'RUB'
    )
    expect(t.total).toBe(9500)
  })

  it('чужая валюта без amountOffer — amount × курс, округление до 2 знаков', () => {
    const t = sumOptionCalc(
      [{ amount: 100.005, currency: 'USD', fxRateToOffer: 90.123456, amountOffer: null, article: 'customs' }],
      'RUB'
    )
    // 100.005 × 90.123456 = 9012.79578… → 9012.80 (копейки целыми)
    expect(t.total).toBe(9012.8)
  })

  it('чужая валюта без курса и без amountOffer — строка не считается', () => {
    const t = sumOptionCalc(
      [
        { amount: 100, currency: 'EUR', fxRateToOffer: null, amountOffer: null, article: 'freight' },
        { amount: 700, currency: 'RUB', fxRateToOffer: null, amountOffer: null, article: 'freight' },
      ],
      'RUB'
    )
    expect(t.total).toBe(700)
    expect(t.byArticle['freight']).toBe(700)
  })

  it('копейки без float-дрейфа (0.1 + 0.2)', () => {
    const t = sumOptionCalc(
      [
        { amount: 0.1, currency: 'RUB', fxRateToOffer: null, amountOffer: null },
        { amount: 0.2, currency: 'RUB', fxRateToOffer: null, amountOffer: null },
      ],
      'RUB'
    )
    expect(t.total).toBe(0.3)
  })

  it('битые суммы пропускаются, Decimal-объект с toNumber читается', () => {
    const t = sumOptionCalc(
      [
        { amount: 'мусор', currency: 'RUB', fxRateToOffer: null, amountOffer: null },
        { amount: { toNumber: () => 42 }, currency: 'RUB', fxRateToOffer: null, amountOffer: null },
      ],
      'RUB'
    )
    expect(t.total).toBe(42)
  })
})

describe('computeAmountOffer', () => {
  it('валюта строки = валюте предложения → сумма как есть, курс null', () => {
    expect(computeAmountOffer(500, 'RUB', 90, 'RUB')).toEqual({ amountOffer: 500, fxRateToOffer: null })
  })
  it('задан курс → amount × rate, округление до 2 знаков', () => {
    expect(computeAmountOffer(100, 'USD', 90.5, 'RUB')).toEqual({ amountOffer: 9050, fxRateToOffer: 90.5 })
    expect(computeAmountOffer(33.333, 'USD', 3, 'RUB').amountOffer).toBe(100)
  })
  it('курс null/неположительный → строка не приводится', () => {
    expect(computeAmountOffer(100, 'USD', null, 'RUB')).toEqual({ amountOffer: null, fxRateToOffer: null })
    expect(computeAmountOffer(100, 'USD', 0, 'RUB')).toEqual({ amountOffer: null, fxRateToOffer: null })
    expect(computeAmountOffer(100, 'USD', -5, 'RUB')).toEqual({ amountOffer: null, fxRateToOffer: null })
  })
})

describe('calcMismatch', () => {
  it('расхождение суммы строк и себестоимости — число (предупреждение, не ошибка)', () => {
    const totals = { byArticle: { freight: 1000 }, total: 1000 }
    expect(calcMismatch(totals, '800')).toBe(200)
    expect(calcMismatch(totals, '1200')).toBe(-200)
  })
  it('нет итогов или себестоимость не задана/нулевая → null', () => {
    expect(calcMismatch(null, '800')).toBeNull()
    expect(calcMismatch({ byArticle: {}, total: 100 }, null)).toBeNull()
    expect(calcMismatch({ byArticle: {}, total: 100 }, '0')).toBeNull()
  })
})
