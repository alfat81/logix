// ─── lib/money.ts — деньги (P1-04) ─────────────────────────────────
//
// Единственная точка форматирования и разбора денег (RULES 2.15):
// formatMoney — единственный способ получить «1 450 ₽» в UI/ленте/
// печатной форме; денежной арифметики здесь и в route.ts нет —
// источник правды всегда Decimal в БД, float допустим только как
// транспорт/вывод (без вычислений). Маржа и суммы НДС не считаются
// (D19: себестоимость и цена клиенту — раздельные данные, наружу
// cost не выходит).
//
// Формат детерминированный (для e2e): целые — без копеек («1 450 ₽»),
// дробные — всегда два знака через запятую («1 450,50 $»); группировка
// разрядов — как у Intl «ru-RU» (узкий неразрывный пробел).

import { z } from 'zod'

// ─── Валюты (DF-17) ──────────────────────────────────────────────────
// Источник выбора валют — справочник RefItem(dir=currency) в БД
// (lib/ref-db.ts: активные записи, мастер включает/отключает).
// CURRENCIES — ЗАПАСНОЙ список на случай ПУСТОЙ таблицы (карточка
// DF-17): свежий деплой без сидажа не должен ломать формы. Не добавлять
// сюда валюты сверх запасных четырёх — пополнение только через
// справочник (IC-16: перечней валют литералами в коде нет).
export const CURRENCIES = ['RUB', 'USD', 'EUR', 'CNY'] as const
export type CurrencyCode = (typeof CURRENCIES)[number]

// Знаки валют — короткие символы в интерфейсе (Intl style:'currency'
// даёт разные представления в зависимости от ICU — держим своё).
// Это таблица СИМВОЛОВ отображения, не реестр валют (IC-16): выбор
// валюты идёт только из справочника; незнакомому коду показываем сам
// код (currencySign).
export const CURRENCY_SIGNS: Record<CurrencyCode, string> = {
  RUB: '₽',
  USD: '$',
  EUR: '€',
  CNY: '¥',
}

// Дополнительные знаки ходовых в ВЭД валют (символы, не реестр —
// реестр только справочник в БД).
const EXTRA_CURRENCY_SIGNS: Record<string, string> = {
  GBP: '£',
  JPY: '¥',
  CHF: '₣',
  TRY: '₺',
  KZT: '₸',
  UAH: '₴',
  KRW: '₩',
  INR: '₹',
  ILS: '₪',
  VND: '₫',
}

// Знак для любого кода из справочника: известный символ либо сам код
// (формат детерминированный: «1 450 KZT» — код как символ).
export function currencySign(code: string): string {
  const c = code.toUpperCase()
  return CURRENCY_SIGNS[c as CurrencyCode] ?? EXTRA_CURRENCY_SIGNS[c] ?? c
}

export function isCurrencyCode(v: unknown): v is CurrencyCode {
  return typeof v === 'string' && (CURRENCIES as readonly string[]).includes(v)
}

// Режим НДС — метка цены, НЕ расчёт (см. enum VatMode в схеме).
export const VAT_MODES = ['WITH_VAT', 'WITHOUT_VAT', 'ZERO_VAT'] as const
export type VatModeCode = (typeof VAT_MODES)[number]

export const VAT_MODE_LABELS: Record<VatModeCode, string> = {
  WITH_VAT: 'с НДС',
  WITHOUT_VAT: 'без НДС',
  ZERO_VAT: 'НДС 0%',
}

export function isVatMode(v: unknown): v is VatModeCode {
  return typeof v === 'string' && (VAT_MODES as readonly string[]).includes(v)
}

type MoneyAmount = number | string

function toNumber(amount: MoneyAmount): number {
  const n = typeof amount === 'string' ? Number(amount.replace(',', '.')) : amount
  if (!Number.isFinite(n)) return NaN
  return n
}

// «1 450 ₽» | «1 450,50 $» — детерминированный вывод для UI, ленты и
// печатной формы. Дробная часть показывается только если она есть.
// DF-17: валюта — любой код справочника (string): знак из таблицы
// символов, незнакомому коду показываем сам код.
export function formatMoney(amount: MoneyAmount, currency: string = 'RUB'): string {
  const n = toNumber(amount)
  if (Number.isNaN(n)) return '—'
  const isWhole = Number.isInteger(n)
  const digits = new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: isWhole ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(n)
  return `${digits} ${currencySign(currency)}`
}

// Строка «1 450 ₽ · без НДС» — цена варианта/снимка с режимом НДС.
export function formatMoneyWithVat(amount: MoneyAmount, currency: string, vatMode: VatModeCode): string {
  const label = VAT_MODE_LABELS[vatMode]
  return label ? `${formatMoney(amount, currency)} · ${label}` : formatMoney(amount, currency)
}

// Разбор ввода менеджера: «1 450,50» / «1450.5» / «1 450» → число;
// мусор, отрицательные, > 2 знаков после запятой → null (валидация —
// на вызывающей стороне). Пробелы/неразрывные пробелы игнорируются.
export function parseMoneyInput(raw: string): number | null {
  const cleaned = raw
    .replace(/[\s\u00a0\u202f]/g, '')
    .replace(',', '.')
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

// ─── zod-помощник для денежных полей API (P1-04) ───────────────────
// Decimal(14,2): положительные суммы, максимум 2 знака после запятой.
// allowZero — для таможенных платежей (0 допустим: льготные категории
// ТН ВЭД). Арифметики нет — только проверка формы числа.
export function moneyAmount(label: string, opts: { allowZero?: boolean } = {}) {
  // max ДО refine: после refine цепочка — ZodEffects, у него нет .max
  const bounded = opts.allowZero
    ? z.number({ errorMap: () => ({ message: `${label} — число` }) })
    : z
        .number({ errorMap: () => ({ message: `${label} — число` }) })
        .max(999_999_999_999, `${label} — слишком большая сумма`)
  return bounded
    .refine((v) => Number.isFinite(v), `${label} — число`)
    .refine(
      (v) => (opts.allowZero ? v >= 0 : v > 0),
      `${label} — ${opts.allowZero ? 'не меньше нуля' : 'больше нуля'}`,
    )
    .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, `${label} — максимум 2 знака после запятой`)
}
