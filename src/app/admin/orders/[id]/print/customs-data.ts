import { fmtRuDate, fmtMoney } from './data'

// ─── DF-19: модель печатного приложения «Расчёт таможенных платежей
// (оценка)» (RULES 2.14: data.ts превысил бы лимит 300 — выезд в
// отдельный файл). Чистая подготовка данных из снимка расчёта
// (CustomsCalculation, isCurrent): деньги — formatMoney через fmtMoney,
// подпись «Оценка…» обязательна (D41).
// ─── DF-19: приложение «Расчёт таможенных платежей (оценка)» ────────
// Чистая подготовка данных из снимка расчёта (CustomsCalculation,
// isCurrent): деньги — formatMoney (RULES 2.15), подпись «Оценка…» —
// обязательна (D41). Структурный вход — без зависимости от Prisma.

export type PrintCustomsCalc = {
  incoterm: string
  incotermPlace: string | null
  calcDate: Date
  fxDate: Date
  fxRates: unknown
  fxReservePercent: unknown // снимок запаса хранится в расчёте; на бланк не выводится
  totals: unknown
  items: {
    hsCode: string
    customsValue: string
    duty: string
    addDuty: string
    vat: string
    allocatedCosts: string
  }[]
}

export type PrintCustomsRow = {
  hsCode: string
  customsValue: string
  duty: string
  addDuty: string
  vat: string
}

export type PrintCustoms = {
  incotermText: string
  calcDateText: string
  fxDateText: string
  fxText: string
  items: PrintCustomsRow[]
  customsValueTotal: string
  dutyTotal: string
  addDutyTotal: string
  vatTotal: string
  feeText: string
  paymentsTotal: string
  brokerFeeText: string | null
  grandTotalText: string | null
}

// Толерантное чтение totals Json (структуру знает lib/customs.ts,
// печатная форма не должна упасть на чужом/старом Json)
function totalsOf(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
}

function moneyOf(v: unknown): string {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
  return Number.isFinite(n) ? fmtMoney(n) : '—'
}

export function buildPrintCustoms(calc: PrintCustomsCalc): PrintCustoms {
  const t = totalsOf(calc.totals)
  const fx =
    calc.fxRates && typeof calc.fxRates === 'object' && !Array.isArray(calc.fxRates)
      ? (calc.fxRates as Record<string, { rate?: unknown; date?: unknown; source?: unknown }>)
      : {}
  const fxText = Object.entries(fx)
    .filter(([code]) => code !== 'RUB')
    .map(([code, e]) => {
      const rate = typeof e?.rate === 'string' || typeof e?.rate === 'number' ? Number(e.rate) : NaN
      const src = e?.source === 'manual' ? ', вручную' : ''
      return `${code} ${Number.isFinite(rate) ? rate.toFixed(4) : '—'}${src}`
    })
    .join(', ')
  const brokerFee = t.brokerFeeRub == null ? null : moneyOf(t.brokerFeeRub)
  return {
    incotermText: [calc.incoterm, calc.incotermPlace].filter(Boolean).join(', '),
    calcDateText: fmtRuDate(calc.calcDate),
    fxDateText: fmtRuDate(calc.fxDate),
    fxText: fxText || '—',
    items: calc.items.map((it) => ({
      hsCode: it.hsCode,
      customsValue: moneyOf(it.customsValue),
      duty: moneyOf(it.duty),
      addDuty: moneyOf(it.addDuty),
      vat: moneyOf(it.vat),
    })),
    customsValueTotal: moneyOf(t.customsValueTotal),
    dutyTotal: moneyOf(t.dutyTotal),
    addDutyTotal: t.addDutyTotal != null && Number(t.addDutyTotal) !== 0 ? moneyOf(t.addDutyTotal) : '',
    vatTotal: moneyOf(t.vatTotal),
    feeText: t.feeRub != null ? moneyOf(t.feeRub) : '',
    paymentsTotal: moneyOf(t.paymentsTotal),
    brokerFeeText: brokerFee,
    grandTotalText: t.grandTotal != null ? moneyOf(t.grandTotal) : null,
  }
}
