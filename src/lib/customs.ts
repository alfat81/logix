import { z } from 'zod'
import { currencyCodeSchema, type IncotermMeta } from './ref'
import { moneyAmount } from './money'
import { percentValue } from './brokers'

// ─── DF-19: чистые функции расчёта таможенных платежей (D38/D39) ─────
// ЕДИНСТВЕННОЕ место арифметики DF-19 (RULES 2.15: деньги — Decimal;
// route.ts денежной арифметики не содержит). Правила условий поставки —
// ДАННЫЕ: флаги приходят из meta справочника Инкотермс (incotermMetaOf,
// справочник DF-17), не из кода (D39/O-12); черновые правила
// (meta.draft) сервер не применяет — до сида справочников расчёт
// отклоняется.
//
// Точность: деньги считаются в КОПЕЙКАХ на BigInt (без float), курс —
// в четвёртых долях (формат CurrencyRate Decimal(14,4)), проценты — в
// базисных пунктах (1% = 100 бп); единственное округление — HALF_UP
// на финальной операции. Эталоны №1–№3 (реальные ДТ клиента) сходятся
// до копейки: scripts/verify_df19_examples.py и customs.test.ts.
//
// Состав базы НДС = ТС + пошлина + доп. пошлина (акциз в ставках
// брокера DF-18 не передаётся; сбор 1010 в базу НЕ входит) —
// подтверждено брокером и эталонами №1–№3, версия правил — константа
// CUSTOMS_RULES_VERSION, попадает в снимок расчёта (воспроизводимость,
// D38/инвариант 11).

export const CUSTOMS_RULES_VERSION = 'df19-2026.1'

// Обязательная подпись расчёта в UI и печатных формах (D41).
export const CUSTOMS_EVALUATION_NOTE =
  'Оценка. Окончательные платежи определяются при декларировании'

// Потолок строк расчёта (свой, не broker.max_items: расчёт шире ответа
// брокера; жёсткий кап схемы против мусора в теле).
export const CUSTOMS_ITEMS_HARD_CAP = 100

// ─── Точечная арифметика (BigInt, фиксированная точка) ───────────────

// half-up деление BigInt (делимое любого знака)
export function halfUpDiv(n: bigint, d: bigint): bigint {
  if (d <= 0n) throw new Error('halfUpDiv: делитель должен быть положительным')
  if (n >= 0n) return (n + d / 2n) / d
  return -((-n + d / 2n) / d)
}

// Число с ≤2 знаками → копейки
function toCents(v: number): bigint {
  return BigInt(Math.round(v * 100))
}

// Строка с двумя знаками (наши же centsToStr) → копейки
export function centsOf(s: string): bigint {
  return BigInt(s.replace('.', ''))
}

// Копейки → строка с двумя знаками (формат Decimal для БД и UI)
export function centsToStr(c: bigint): string {
  const neg = c < 0n
  const abs = (neg ? -c : c).toString().padStart(3, '0')
  return `${neg ? '-' : ''}${abs.slice(0, -2)}.${abs.slice(-2)}`
}

// «12.5» / 12.5 → базисные пункты (целые)
function toBp(v: number): bigint {
  return BigInt(Math.round(v * 100))
}

// «80.9604» → масштаб 1e4 (809604n); дробная часть дополняется нулями
function rateToScaled4(rate: string): bigint {
  const [int = '0', frac = ''] = rate.trim().split('.')
  const frac4 = (frac + '0000').slice(0, 4)
  return BigInt(int + frac4)
}

// Перевод суммы в копейках foreign-валюты в копейки RUB по снимку
// (курс за ОДНУ единицу, масштаб 1e4) с запасом reserveBp; RUB — 1:1.
export function convertCentsRub(
  cents: bigint,
  currency: string,
  fx: CustomsFxSnapshot,
  reserveBp: bigint
): bigint {
  if (currency === 'RUB') return cents
  const entry = fx[currency]
  if (!entry) {
    throw new CustomsInputError(`Курс валюты ${currency} не задан в расчёте — добавьте курс или выберите другую валюту`)
  }
  if (!/^\d+(\.\d{1,4})?$/.test(entry.rate.trim())) {
    throw new CustomsInputError(`Курс валюты ${currency} — положительное число с до 4 знаками`)
  }
  const rateScaled = rateToScaled4(entry.rate)
  if (rateScaled <= 0n) {
    throw new CustomsInputError(`Курс валюты ${currency} — положительное число`)
  }
  return halfUpDiv(cents * rateScaled * (10000n + reserveBp), 10000n * 10000n)
}

// ─── Ошибки домена (роут маппит на 400) ───────────────────────────────

export class CustomsInputError extends Error {}

// ─── Типы ─────────────────────────────────────────────────────────────

// Снимок курса за одну единицу: { USD: { rate: '73.1275', date: '2026-05-18', source: 'cbr' } }
export type CustomsFxEntry = { rate: string; date: string; source: 'cbr' | 'manual' }
export type CustomsFxSnapshot = Record<string, CustomsFxEntry>

export type CustomsRuleFlags = Pick<
  IncotermMeta,
  'addFreightToArrival' | 'addInsurance' | 'deductPostArrival'
>

export type CustomsItemInput = {
  brokerItemId?: string | null
  hsCode: string
  goodsValue: number
  goodsCurrency: string
  netWeightKg: number
  dutyPercent: number | null
  addDutyPercent: number | null
  vatPercent: number | null
}

export type CustomsFeeRow = { upperBound: number | string | null; feeRub: number | string }

export type CustomsComputedItem = {
  hsCode: string
  goodsRub: string
  allocatedCosts: string
  customsValue: string
  duty: string
  addDuty: string
  vat: string
}

export type CustomsTotals = {
  customsValueTotal: string
  dutyTotal: string
  addDutyTotal: string
  vatTotal: string
  feeRub: string | null
  paymentsTotal: string
  brokerFeeRub: string | null
  grandTotal: string
  freightComponentRub: string
  otherComponentRub: string
  itemsCount: number
  netWeightTotal: string
}

// ─── Распределение начислений по кодам (D40, правила ДТС-1) ───────────

// Доли компонента baseCents по весам (одинаковый масштаб, BigInt):
// сумма долей РОВНО baseCents (последняя доля — точный остаток).
// Σвесов = 0 — равные доли (распределить не по чему — честный фолбэк).
export function allocateComponent(baseCents: bigint, weights: bigint[]): bigint[] {
  const n = weights.length
  if (n === 0) return []
  const total = weights.reduce((a, w) => a + w, 0n)
  if (total <= 0n) {
    const even = halfUpDiv(baseCents, BigInt(n))
    const out = weights.map(() => even)
    out[n - 1] = baseCents - even * BigInt(n - 1)
    return out
  }
  const out = weights.map((w) => halfUpDiv(baseCents * w, total))
  out[n - 1] = baseCents - out.slice(0, -1).reduce((a, s) => a + s, 0n)
  return out
}

type AllocationMethod = 'weight' | 'value'

// Метод компонента: переопределение менеджера > правило ДТС-1
// (перевозка — вес НЕТТО, страхование/посредники/упаковка — стоимость).
export function allocationMethods(
  override: { freight?: AllocationMethod; other?: AllocationMethod } | null | undefined
): { freight: AllocationMethod; other: AllocationMethod } {
  return {
    freight: override?.freight === 'value' ? 'value' : 'weight',
    other: override?.other === 'weight' ? 'weight' : 'value',
  }
}

// ─── Таможенный сбор: ступень шкалы от ОБЩЕЙ ТС (одна ступень) ────────

export function pickFeeRub(totalTVCents: bigint, rows: CustomsFeeRow[]): bigint | null {
  const ordered = [...rows]
    .map((r) => ({
      upper: r.upperBound === null || r.upperBound === undefined ? null : BigInt(Math.round(Number(r.upperBound) * 100)),
      fee: BigInt(Math.round(Number(r.feeRub) * 100)),
    }))
    .sort((a, b) => {
      if (a.upper === null) return 1
      if (b.upper === null) return -1
      return a.upper < b.upper ? -1 : a.upper > b.upper ? 1 : 0
    })
  for (const row of ordered) {
    if (row.upper === null || totalTVCents <= row.upper) return row.fee
  }
  return null
}

// ─── Главный расчёт ───────────────────────────────────────────────────

export type ComputeCustomsInput = {
  flags: CustomsRuleFlags
  freightTotal: number
  freightCurrency: string
  freightToArrival: number | null
  insurance: number
  otherCosts: number
  items: CustomsItemInput[]
  fx: CustomsFxSnapshot
  reservePercent: number
  allocationOverride: { freight?: AllocationMethod; other?: AllocationMethod } | null
  feeRows: CustomsFeeRow[]
  feeRubManual: number | null
  brokerFeeRub: number | null
}

export function computeCustomsCalculation(
  input: ComputeCustomsInput
): { items: CustomsComputedItem[]; totals: CustomsTotals } {
  const { flags, fx, items } = input
  if (items.length === 0) throw new CustomsInputError('Добавьте хотя бы одну строку с кодом ТН ВЭД')

  const reserveBp = toBp(input.reservePercent)
  const conv = (v: number, currency: string) => convertCentsRub(toCents(v), currency, fx, reserveBp)

  // ── Компоненты дополнительных начислений (в рублях) ──
  // Перевозка: добавляется по флагу условия поставки (часть до места
  // прибытия; без разделения — фрахт целиком, консервативно). Для
  // вычитающих терминов (фрахт в цене, deductPostArrival) вычитается
  // ПОДТВЕРЖДЁННАЯ часть после места прибытия (total − toArrival);
  // разделение не заполнено (null) — документов нет, вычета нет
  // (консервативно: ТС не уменьшаем без документов).
  if (input.freightToArrival != null && input.freightToArrival > input.freightTotal + 1e-9) {
    throw new CustomsInputError('Фрахт до места прибытия не может быть больше фрахта по счёту')
  }
  const freightComponent = flags.addFreightToArrival
    ? conv(input.freightToArrival ?? input.freightTotal, input.freightCurrency)
    : flags.deductPostArrival && input.freightToArrival != null
      ? -conv(input.freightTotal - input.freightToArrival, input.freightCurrency)
      : 0n
  // Прочие: страхование (только фактически понесённое сверх цены —
  // D43: вводит менеджер) + погрузка/разгрузка, посредники, упаковка.
  const otherComponent = conv(input.insurance, input.freightCurrency) + conv(input.otherCosts, input.freightCurrency)

  // ── Стоимость товара в рублях по позициям ──
  const goodsRub = items.map((it) => conv(it.goodsValue, it.goodsCurrency))
  const methods = allocationMethods(input.allocationOverride)
  const weightWeights = items.map((it) => BigInt(Math.round(it.netWeightKg * 1000)))
  const freightShares = allocateComponent(freightComponent, methods.freight === 'weight' ? weightWeights : goodsRub)
  const otherShares = allocateComponent(otherComponent, methods.other === 'weight' ? weightWeights : goodsRub)

  const computed: CustomsComputedItem[] = items.map((it, i) => {
    const allocated = freightShares[i] + otherShares[i]
    const tv = goodsRub[i] + allocated
    if (tv < 0n) {
      throw new CustomsInputError(`Вычет превышает стоимость позиции ${it.hsCode} — уменьшите вычитаемую часть фрахта`)
    }
    const duty = it.dutyPercent != null ? halfUpDiv(tv * toBp(it.dutyPercent), 10000n) : 0n
    const addDuty = it.addDutyPercent != null ? halfUpDiv(tv * toBp(it.addDutyPercent), 10000n) : 0n
    // НДС = (ТС + пошлина + доп. пошлина [+ акциз]) × % — сбор 1010
    // в базу НЕ входит (эталоны №1–№3; ставка 22% с 01.01.2026)
    const vat = it.vatPercent != null ? halfUpDiv((tv + duty + addDuty) * toBp(it.vatPercent), 10000n) : 0n
    return {
      hsCode: it.hsCode,
      goodsRub: centsToStr(goodsRub[i]),
      allocatedCosts: centsToStr(allocated),
      customsValue: centsToStr(tv),
      duty: centsToStr(duty),
      addDuty: centsToStr(addDuty),
      vat: centsToStr(vat),
    }
  })

  // ── Итоги ──
  const sumOf = (key: 'customsValue' | 'duty' | 'addDuty' | 'vat') =>
    computed.reduce((acc, it) => acc + centsOf(it[key]), 0n)

  const customsValueTotal = sumOf('customsValue')
  const dutyTotal = sumOf('duty')
  const addDutyTotal = sumOf('addDuty')
  const vatTotal = sumOf('vat')
  const fee =
    input.feeRows.length > 0 && input.feeRubManual == null
      ? pickFeeRub(customsValueTotal, input.feeRows)
      : null
  const feeCents = input.feeRubManual != null ? toCents(input.feeRubManual) : fee
  const paymentsTotal = dutyTotal + addDutyTotal + vatTotal + (feeCents ?? 0n)
  const brokerFeeCents = input.brokerFeeRub != null ? toCents(input.brokerFeeRub) : null
  const netWeightTotal = items.reduce((a, it) => a + it.netWeightKg, 0)

  return {
    items: computed,
    totals: {
      customsValueTotal: centsToStr(customsValueTotal),
      dutyTotal: centsToStr(dutyTotal),
      addDutyTotal: centsToStr(addDutyTotal),
      vatTotal: centsToStr(vatTotal),
      feeRub: feeCents != null ? centsToStr(feeCents) : null,
      paymentsTotal: centsToStr(paymentsTotal),
      brokerFeeRub: brokerFeeCents != null ? centsToStr(brokerFeeCents) : null,
      grandTotal: centsToStr(paymentsTotal + (brokerFeeCents ?? 0n)),
      freightComponentRub: centsToStr(freightComponent),
      otherComponentRub: centsToStr(otherComponent),
      itemsCount: items.length,
      netWeightTotal: String(Math.round(netWeightTotal * 1000) / 1000),
    },
  }
}

// ─── zod-схемы входа (POST/PUT) ───────────────────────────────────────

export const CUSTOMS_ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export const CustomsCalcItemSchema = z.object({
  brokerItemId: z.string().trim().max(40).nullable().optional(),
  hsCode: z.string().trim().regex(/^\d{10}$/, 'Код ТН ВЭД — ровно 10 цифр'),
  goodsValue: moneyAmount('Стоимость товара'),
  goodsCurrency: currencyCodeSchema,
  netWeightKg: z
    .number({ errorMap: () => ({ message: 'Вес нетто — число' }) })
    .positive('Вес нетто — больше нуля')
    .max(10_000_000, 'Вес нетто — слишком большой')
    .refine((v) => Math.abs(v * 1000 - Math.round(v * 1000)) < 1e-6, 'Вес нетто — максимум 3 знака'),
  dutyPercent: percentValue('Пошлина').nullable(),
  addDutyPercent: percentValue('Доп. пошлина').nullable(),
  vatPercent: percentValue('НДС').nullable(),
})

export const CustomsCalcInputSchema = z
  .object({
    incoterm: z
      .string({ errorMap: () => ({ message: 'Выберите условие поставки' }) })
      .trim()
      .min(2, 'Выберите условие поставки')
      .max(10)
      .transform((v) => v.toUpperCase()),
    incotermPlace: z.string().trim().max(200, 'Место — слишком длинное').nullable().optional(),
    // Дата регистрации ДТ (курс для ТС); пусто — сегодня
    calcDate: z.string().regex(CUSTOMS_ISO_DATE_RE, 'Дата — ГГГГ-ММ-ДД').optional(),
    // Дата курса (обычно совпадает); пусто — calcDate
    fxDate: z.string().regex(CUSTOMS_ISO_DATE_RE, 'Дата — ГГГГ-ММ-ДД').optional(),
    // Ручные курсы за единицу ({ USD: '80.9604' }): курс ЦБ недоступен
    // (нет импорта/даты) — менеджер вводит известный, источник manual
    fxRatesManual: z
      .record(z.string().trim().regex(/^\d+(\.\d{1,4})?$/, 'Курс — число с до 4 знаками'))
      .optional(),
    freightTotal: moneyAmount('Фрахт по счёту', { allowZero: true }),
    freightCurrency: currencyCodeSchema,
    freightToArrival: moneyAmount('Фрахт до места прибытия', { allowZero: true }).nullable().optional(),
    insurance: moneyAmount('Страхование', { allowZero: true }).default(0),
    otherCosts: moneyAmount('Прочие расходы', { allowZero: true }).default(0),
    brokerFeeRub: moneyAmount('Вознаграждение брокера', { allowZero: true }).nullable().optional(),
    allocationOverride: z
      .object({
        freight: z.enum(['weight', 'value']).optional(),
        other: z.enum(['weight', 'value']).optional(),
      })
      .nullable()
      .optional(),
    feeRubManual: moneyAmount('Таможенный сбор', { allowZero: true }).nullable().optional(),
    items: z
      .array(CustomsCalcItemSchema)
      .min(1, 'Добавьте хотя бы одну строку с кодом ТН ВЭД')
      .max(CUSTOMS_ITEMS_HARD_CAP, `Строк — не больше ${CUSTOMS_ITEMS_HARD_CAP}`),
  })
  .superRefine((v, ctx) => {
    const toArrival = v.freightToArrival ?? v.freightTotal
    if (toArrival > v.freightTotal) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Фрахт до места прибытия не может быть больше фрахта по счёту',
        path: ['freightToArrival'],
      })
    }
    const codes = new Set(v.items.map((it) => it.hsCode))
    if (codes.size !== v.items.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Коды ТН ВЭД в расчёте не должны повторяться',
        path: ['items'],
      })
    }
  })

export type CustomsCalcInput = z.infer<typeof CustomsCalcInputSchema>
