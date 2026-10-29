import { describe, expect, it } from 'vitest'
import {
  allocationMethods,
  allocateComponent,
  centsToStr,
  computeCustomsCalculation,
  CustomsCalcInputSchema,
  CustomsInputError,
  CUSTOMS_RULES_VERSION,
  pickFeeRub,
  type CustomsFeeRow,
  type CustomsFxSnapshot,
} from './customs'

// ─── DF-19: unit-тесты расчёта таможенных платежей ────────────────────
// Эталоны №1–№3 — реальные ДТ клиента (карточка DF-19, шаг 1 закрыт
// 30.10.2026). Арифметика сверяется и до копейки с ДТ (№2 сходится
// точно), и с допуском ±1 ₽ на позицию там, где ДТ считала фрахт
// без округления (№3: Δ 0,30 ₽ на ТС). Шкала сборов — редакция
// с 01.01.2026 (ПП РФ № 1637 в ред. № 1638).

// Шкала сборов 2026 (та же, что в scripts/ref-data/customs-fees.ts
// и scripts/verify_df19_examples.py; данные для ЧИСТОЙ функции —
// фикстура теста, не литерал в логике)
const SCALE_2026: CustomsFeeRow[] = [
  { upperBound: 200000, feeRub: 1231 },
  { upperBound: 450000, feeRub: 2462 },
  { upperBound: 1200000, feeRub: 4924 },
  { upperBound: 2700000, feeRub: 13541 },
  { upperBound: 4200000, feeRub: 18465 },
  { upperBound: 5500000, feeRub: 21344 },
  { upperBound: 10000000, feeRub: 49240 },
  { upperBound: null, feeRub: 73860 },
]

const fxOf = (rate: string, date = '2026-03-25'): CustomsFxSnapshot => ({
  USD: { rate, date, source: 'manual' },
})

// ─── Снимок курса и конвертация ───────────────────────────────────────

describe('DF-19: конвертация и распределение', () => {
  it('курс за единицу с округлением HALF_UP до копейки', () => {
    // 34 517.80 USD × 80.9604 (эталон №3)
    expect(centsToStr(3451780n)).toBe('34517.80')
  })

  it('распределение: сумма долей ровно базе, последняя — остаток', () => {
    const shares = allocateComponent(9222832n, [1225n, 1532n, 6627n, 46616n])
    expect(shares.reduce((a, s) => a + s, 0n)).toBe(9222832n)
    // доли ДТС-1: 2.1875 / 2.7357 / 11.8339 / 83.2429 % (эталон №1)
    expect(shares.map(centsToStr)).toEqual(['2017.49', '2523.10', '10914.23', '76773.50'])
  })

  it('распределение при нулевых весах — равные доли без потери копеек', () => {
    const shares = allocateComponent(10000n, [0n, 0n, 0n])
    expect(shares.reduce((a, s) => a + s, 0n)).toBe(10000n)
    expect(shares).toEqual([3333n, 3333n, 3334n])
  })

  it('методы: умолчания ДТС-1 (перевозка — вес, прочие — стоимость), override менеджера', () => {
    expect(allocationMethods(null)).toEqual({ freight: 'weight', other: 'value' })
    expect(allocationMethods({ freight: 'value' })).toEqual({ freight: 'value', other: 'value' })
    expect(allocationMethods({ other: 'weight' })).toEqual({ freight: 'weight', other: 'weight' })
  })

  it('шкала сборов: границы ступеней включительны, открытая верхняя скобка', () => {
    expect(pickFeeRub(20000000n, SCALE_2026)).toBe(123100n)
    expect(pickFeeRub(20001000n, SCALE_2026)).toBe(246200n)
    expect(pickFeeRub(270000000n, SCALE_2026)).toBe(1354100n) // ровно 2 700 000
    expect(pickFeeRub(270000001n, SCALE_2026)).toBe(1846500n) // 2 700 000,01
    expect(pickFeeRub(291147490n, SCALE_2026)).toBe(1846500n) // эталоны №2–№3
    expect(pickFeeRub(999999999999n, SCALE_2026)).toBe(7386000n)
    expect(pickFeeRub(100n, [])).toBeNull() // шкалы нет — ручной ввод
  })
})

// ─── Эталон №2: ДТ 10418010/230126/5008411 (FCA ISTANBUL) ────────────
// Цена по договору EUR 39 000 × 88,7898 = 3 462 802,20 (гр. 12 ДТС);
// + перевозка 67 532,08 (гр. 17) → ТС 3 530 334,28; пошлины нет
// (8532230000), НДС 22% = 776 673,54; сбор 18 465; итог 795 138,54.

describe('DF-19: эталон №2 — FCA Турция, EUR-цена, НДС без пошлины', () => {
  const result = computeCustomsCalculation({
    flags: { addFreightToArrival: true, addInsurance: true, deductPostArrival: false },
    freightTotal: 67532.08,
    freightCurrency: 'RUB',
    freightToArrival: null, // умолчание: фрахт целиком (без разделения)
    insurance: 0,
    otherCosts: 0,
    items: [
      {
        hsCode: '8532230000',
        goodsValue: 39000,
        goodsCurrency: 'EUR',
        netWeightKg: 18400,
        dutyPercent: null,
        addDutyPercent: null,
        vatPercent: 22,
      },
    ],
    fx: {
      EUR: { rate: '88.7898', date: '2026-01-23', source: 'manual' },
    },
    reservePercent: 0,
    allocationOverride: null,
    feeRows: SCALE_2026,
    feeRubManual: null,
    brokerFeeRub: null,
  })

  it('ТС = цена по курсу + фрахт целиком (сходится с ДТС до копейки)', () => {
    expect(result.items[0].goodsRub).toBe('3462802.20')
    expect(result.items[0].allocatedCosts).toBe('67532.08')
    expect(result.items[0].customsValue).toBe('3530334.28')
  })

  it('НДС 22% от ТС без пошлины, сбор по скобке 2,7–4,2 млн', () => {
    expect(result.items[0].duty).toBe('0.00')
    expect(result.items[0].vat).toBe('776673.54')
    expect(result.totals.feeRub).toBe('18465.00')
    expect(result.totals.paymentsTotal).toBe('795138.54')
  })

  it('версия правил в снимке — константа релиза', () => {
    expect(CUSTOMS_RULES_VERSION).toBe('df19-2026.1')
  })
})

// ─── Эталон №3: ДТ 10702070/250326/5113751 (FOB NINGBO, море) ────────
// Товар 34 517,80 + фрахт 1 443,92 USD × 80,9604 = ТС 2 911 474,90;
// пошлина 3% = 87 344,25; НДС 22% от (ТС+пошлина) = 659 740,21;
// сбор 18 465; итог 765 549,46. ДТ считала фрахт без округления —
// допуск карточки ±1 ₽ на позицию (фактически 0,30 ₽ на ТС).

describe('DF-19: эталон №3 — FOB море, пошлина 3%, база НДС ТС+пошлина', () => {
  const result = computeCustomsCalculation({
    flags: { addFreightToArrival: true, addInsurance: true, deductPostArrival: false },
    freightTotal: 1443.92,
    freightCurrency: 'USD',
    freightToArrival: null,
    insurance: 0,
    otherCosts: 0,
    items: [
      {
        hsCode: '8483402308',
        goodsValue: 34517.8,
        goodsCurrency: 'USD',
        netWeightKg: 12000,
        dutyPercent: 3,
        addDutyPercent: null,
        vatPercent: 22,
      },
    ],
    fx: fxOf('80.9604'),
    reservePercent: 0,
    allocationOverride: null,
    feeRows: SCALE_2026,
    feeRubManual: null,
    brokerFeeRub: 25000,
  })

  it('ТС, пошлина, НДС — в допуске ±1 ₽ к ДТ', () => {
    expect(Math.abs(Number(result.items[0].customsValue) - 2911474.9)).toBeLessThanOrEqual(1)
    expect(Math.abs(Number(result.items[0].duty) - 87344.25)).toBeLessThanOrEqual(0.01)
    expect(Math.abs(Number(result.items[0].vat) - 659740.21)).toBeLessThanOrEqual(1)
  })

  it('сбор в базу НДС не входит; вознаграждение брокера — вне платежей (D42)', () => {
    const tv = Number(result.items[0].customsValue)
    const duty = Number(result.items[0].duty)
    expect(result.items[0].vat).toBe(centsToStr(BigInt(Math.round((tv + duty) * 0.22 * 100))))
    expect(result.totals.paymentsTotal).toBe(
      centsToStr(
        BigInt(result.items[0].duty.replace('.', '')) +
          BigInt(result.items[0].vat.replace('.', '')) +
          1846500n
      )
    )
    expect(result.totals.brokerFeeRub).toBe('25000.00')
    expect(BigInt(result.totals.grandTotal.replace('.', ''))).toBe(
      BigInt(result.totals.paymentsTotal.replace('.', '')) + 2500000n
    )
  })
})

// ─── Эталон №1: ДТ 10132160/180526/5191269 (FCA авиа, 4 кода FESTO) ──
// Перевозка 92 228,32 ₽ распределена по весу НЕТТО (гр. 38, Σ 56 кг):
// доли ДТС 2.1875/2.7357/11.8339/83.2429% — веса reproduced в ноль.

describe('DF-19: эталон №1 — перевозка по весу НЕТТО по 4 кодам', () => {
  const weights = [1.225, 1.532, 6.627, 46.616]
  const result = computeCustomsCalculation({
    flags: { addFreightToArrival: true, addInsurance: true, deductPostArrival: false },
    freightTotal: 92228.32,
    freightCurrency: 'RUB',
    freightToArrival: null,
    insurance: 0,
    otherCosts: 0,
    items: weights.map((w, i) => ({
      hsCode: `8424${i}00000`.slice(0, 10),
      goodsValue: 1000,
      goodsCurrency: 'RUB',
      netWeightKg: w,
      dutyPercent: null,
      addDutyPercent: null,
      vatPercent: null,
    })),
    fx: {},
    reservePercent: 0,
    allocationOverride: null,
    feeRows: [],
    feeRubManual: null,
    brokerFeeRub: null,
  })

  it('доли перевозки пропорциональны нетто-весам, сумма = базе в ноль', () => {
    const shares = result.items.map((it) => Number(it.allocatedCosts))
    expect(Math.round(shares.reduce((a, s) => a + s, 0) * 100)).toBe(9222832)
    const expected = [2017.49, 2523.1, 10914.23, 76773.5]
    shares.forEach((s, i) => expect(Math.abs(s - expected[i])).toBeLessThan(0.005))
    // веса 56 кг в сумме — как в гр. 38 ДТС
    expect(result.totals.netWeightTotal).toBe('56')
  })

  it('override менеджера: перевозка по стоимости вместо веса', () => {
    const over = computeCustomsCalculation({
      flags: { addFreightToArrival: true, addInsurance: true, deductPostArrival: false },
      freightTotal: 1000,
      freightCurrency: 'RUB',
      freightToArrival: null,
      insurance: 0,
      otherCosts: 0,
      items: [
        { hsCode: '1111111111', goodsValue: 50000, goodsCurrency: 'RUB', netWeightKg: 75, dutyPercent: null, addDutyPercent: null, vatPercent: null },
        { hsCode: '2222222222', goodsValue: 50000, goodsCurrency: 'RUB', netWeightKg: 25, dutyPercent: null, addDutyPercent: null, vatPercent: null },
      ],
      fx: {},
      reservePercent: 0,
      allocationOverride: { freight: 'value' },
      feeRows: [],
      feeRubManual: null,
      brokerFeeRub: null,
    })
    // по весу было бы 750/250 — по стоимости ровно пополам
    expect(over.items.map((it) => it.allocatedCosts)).toEqual(['500.00', '500.00'])
  })
})

// ─── Синтетические кейсы (пробелы эталонной базы до реальных ДТ) ─────

describe('DF-19: синтетика — DAP-вычет, страхование, запас курса, ручной сбор', () => {
  it('DAP: подтверждённый вычет перевозки после места прибытия уменьшает ТС', () => {
    const result = computeCustomsCalculation({
      flags: { addFreightToArrival: false, addInsurance: false, deductPostArrival: true },
      freightTotal: 500,
      freightCurrency: 'USD',
      freightToArrival: 200, // документами подтверждено: до прибытия 200, после — 300
      insurance: 0,
      otherCosts: 0,
      items: [
        { hsCode: '8703331090', goodsValue: 100000, goodsCurrency: 'USD', netWeightKg: 2000, dutyPercent: null, addDutyPercent: null, vatPercent: 22 },
      ],
      fx: fxOf('90'),
      reservePercent: 0,
      allocationOverride: null,
      feeRows: SCALE_2026,
      feeRubManual: null,
      brokerFeeRub: null,
    })
    // 100 000 × 90 = 9 000 000 − 300 × 90 = 27 000 → ТС 8 973 000
    expect(result.items[0].customsValue).toBe('8973000.00')
    expect(result.items[0].allocatedCosts).toBe('-27000.00')
    expect(result.totals.feeRub).toBe('49240.00')
    expect(result.items[0].vat).toBe('1974060.00')
  })

  it('без документов вычета нет: freightToArrival по умолчанию 0 для вычитающих терминов', () => {
    const result = computeCustomsCalculation({
      flags: { addFreightToArrival: false, addInsurance: false, deductPostArrival: true },
      freightTotal: 500,
      freightCurrency: 'USD',
      freightToArrival: null,
      insurance: 0,
      otherCosts: 0,
      items: [
        { hsCode: '8703331090', goodsValue: 100000, goodsCurrency: 'USD', netWeightKg: 2000, dutyPercent: null, addDutyPercent: null, vatPercent: 22 },
      ],
      fx: fxOf('90'),
      reservePercent: 0,
      allocationOverride: null,
      feeRows: SCALE_2026,
      feeRubManual: null,
      brokerFeeRub: null,
    })
    expect(result.items[0].customsValue).toBe('9000000.00')
  })

  it('страхование и прочие расходы — компонентом «прочие» по стоимости (D43)', () => {
    const result = computeCustomsCalculation({
      flags: { addFreightToArrival: true, addInsurance: true, deductPostArrival: false },
      freightTotal: 0,
      freightCurrency: 'USD',
      freightToArrival: 0,
      insurance: 150,
      otherCosts: 50,
      items: [
        { hsCode: '30049000010', goodsValue: 10000, goodsCurrency: 'USD', netWeightKg: 100, dutyPercent: 0, addDutyPercent: null, vatPercent: 22 },
      ],
      fx: fxOf('70'),
      reservePercent: 0,
      allocationOverride: null,
      feeRows: SCALE_2026,
      feeRubManual: null,
      brokerFeeRub: null,
    })
    // (150 + 50) × 70 = 14 000 ₽ сверх стоимости товара 700 000
    expect(result.totals.otherComponentRub).toBe('14000.00')
    expect(result.items[0].customsValue).toBe('714000.00')
  })

  it('запас к курсу применяется к конвертации (оценка, D41)', () => {
    const result = computeCustomsCalculation({
      flags: { addFreightToArrival: true, addInsurance: true, deductPostArrival: false },
      freightTotal: 0,
      freightCurrency: 'USD',
      freightToArrival: 0,
      insurance: 0,
      otherCosts: 0,
      items: [
        { hsCode: '85171300000', goodsValue: 1000, goodsCurrency: 'USD', netWeightKg: 10, dutyPercent: null, addDutyPercent: null, vatPercent: 22 },
      ],
      fx: fxOf('80'),
      reservePercent: 5,
      allocationOverride: null,
      feeRows: SCALE_2026,
      feeRubManual: null,
      brokerFeeRub: null,
    })
    // 1000 × 80 × 1,05 = 84 000
    expect(result.items[0].customsValue).toBe('84000.00')
  })

  it('ручной сбор (до утверждения шкалы) перекрывает шкалу', () => {
    const result = computeCustomsCalculation({
      flags: { addFreightToArrival: true, addInsurance: true, deductPostArrival: false },
      freightTotal: 0,
      freightCurrency: 'RUB',
      freightToArrival: 0,
      insurance: 0,
      otherCosts: 0,
      items: [
        { hsCode: '85171300000', goodsValue: 1000, goodsCurrency: 'RUB', netWeightKg: 10, dutyPercent: null, addDutyPercent: null, vatPercent: 22 },
      ],
      fx: {},
      reservePercent: 0,
      allocationOverride: null,
      feeRows: SCALE_2026,
      feeRubManual: 5000,
      brokerFeeRub: null,
    })
    expect(result.totals.feeRub).toBe('5000.00')
  })

  it('отрицательная ТС (вычет больше стоимости) — ошибка домена', () => {
    expect(() =>
      computeCustomsCalculation({
        flags: { addFreightToArrival: false, addInsurance: false, deductPostArrival: true },
        freightTotal: 100000,
        freightCurrency: 'USD',
        freightToArrival: 0,
        insurance: 0,
        otherCosts: 0,
        items: [
          { hsCode: '8703331090', goodsValue: 1000, goodsCurrency: 'USD', netWeightKg: 2000, dutyPercent: null, addDutyPercent: null, vatPercent: 22 },
        ],
        fx: fxOf('90'),
        reservePercent: 0,
        allocationOverride: null,
        feeRows: [],
        feeRubManual: null,
        brokerFeeRub: null,
      })
    ).toThrow(CustomsInputError)
  })
})

// ─── Схема входа ──────────────────────────────────────────────────────

describe('DF-19: zod-схема входа', () => {
  const base = {
    incoterm: 'fob',
    freightTotal: 1443.92,
    freightCurrency: 'usd',
    items: [
      {
        hsCode: '8483402308',
        goodsValue: 34517.8,
        goodsCurrency: 'USD',
        netWeightKg: 12000,
        dutyPercent: 3,
        addDutyPercent: null,
        vatPercent: 22,
      },
    ],
  }

  it('нормализует коды к верхнему регистру, допускает минимум входа', () => {
    const parsed = CustomsCalcInputSchema.parse(base)
    expect(parsed.incoterm).toBe('FOB')
    expect(parsed.freightCurrency).toBe('USD')
    expect(parsed.insurance).toBe(0)
    expect(parsed.otherCosts).toBe(0)
  })

  it('фрахт до прибытия больше счёта, дубли кодов — отказ', () => {
    expect(() =>
      CustomsCalcInputSchema.parse({ ...base, freightToArrival: 2000 })
    ).toThrow(/не может быть больше/)
    expect(() =>
      CustomsCalcInputSchema.parse({
        ...base,
        items: [base.items[0], { ...base.items[0] }],
      })
    ).toThrow(/не должны повторяться/)
  })

  it('проценты вне 0–100 и код не из 10 цифр — отказ', () => {
    expect(() =>
      CustomsCalcInputSchema.parse({
        ...base,
        items: [{ ...base.items[0], dutyPercent: 120 }],
      })
    ).toThrow()
    expect(() =>
      CustomsCalcInputSchema.parse({
        ...base,
        items: [{ ...base.items[0], hsCode: '8483402' }],
      })
    ).toThrow(/10 цифр/)
  })
})
