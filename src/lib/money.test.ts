import { describe, expect, it } from 'vitest'
import {
  formatMoney,
  formatMoneyWithVat,
  parseMoneyInput,
  CURRENCY_SIGNS,
  VAT_MODE_LABELS,
} from './money'

// P1-04: детерминированный формат денег (RULES 2.15 — единственная
// точка форматирования). Разделитель разрядов — узкий неразрывный
// пробел Intl «ru-RU» (\u00a0).
const NBSP = '\u00a0'

describe('formatMoney', () => {
  it('целые рубли — без копеек', () => {
    expect(formatMoney(1450, 'RUB')).toBe(`1${NBSP}450 ₽`)
  })

  it('дробные — всегда два знака через запятую', () => {
    expect(formatMoney(1450.5, 'RUB')).toBe(`1${NBSP}450,50 ₽`)
    expect(formatMoney('0.1', 'RUB')).toBe('0,10 ₽')
  })

  it('строка из Decimal (точка) понимается как число', () => {
    expect(formatMoney('1450.50', 'RUB')).toBe(`1${NBSP}450,50 ₽`)
  })

  it('валюты: $, €, ¥', () => {
    expect(formatMoney(2000, 'USD')).toBe(`2${NBSP}000 $`)
    expect(formatMoney(3000, 'EUR')).toBe(`3${NBSP}000 €`)
    expect(formatMoney(5000, 'CNY')).toBe(`5${NBSP}000 ¥`)
  })

  it('знаки валют — из CURRENCY_SIGNS', () => {
    expect(CURRENCY_SIGNS.RUB).toBe('₽')
    expect(CURRENCY_SIGNS.USD).toBe('$')
    expect(CURRENCY_SIGNS.EUR).toBe('€')
    expect(CURRENCY_SIGNS.CNY).toBe('¥')
  })

  it('мусор на входе — «—», а не падение', () => {
    expect(formatMoney('abc', 'RUB')).toBe('—')
    expect(formatMoney(NaN, 'USD')).toBe('—')
  })

  it('крупные суммы с группировкой', () => {
    expect(formatMoney(1234567, 'RUB')).toBe(`1${NBSP}234${NBSP}567 ₽`)
  })
})

describe('formatMoneyWithVat', () => {
  it('цена с меткой НДС', () => {
    expect(formatMoneyWithVat(1450, 'RUB', 'WITHOUT_VAT')).toBe(`1${NBSP}450 ₽ · без НДС`)
    expect(formatMoneyWithVat(1450, 'RUB', 'WITH_VAT')).toBe(`1${NBSP}450 ₽ · с НДС`)
    expect(formatMoneyWithVat(1450, 'RUB', 'ZERO_VAT')).toBe(`1${NBSP}450 ₽ · НДС 0%`)
  })

  it('подписи НДС — из VAT_MODE_LABELS', () => {
    expect(VAT_MODE_LABELS.WITH_VAT).toBe('с НДС')
    expect(VAT_MODE_LABELS.WITHOUT_VAT).toBe('без НДС')
    expect(VAT_MODE_LABELS.ZERO_VAT).toBe('НДС 0%')
  })
})

describe('parseMoneyInput', () => {
  it('запятая как десятичный разделитель', () => {
    expect(parseMoneyInput('1450,5')).toBe(1450.5)
  })

  it('точка тоже принимается', () => {
    expect(parseMoneyInput('1450.50')).toBe(1450.5)
  })

  it('пробелы и неразрывные пробелы игнорируются', () => {
    expect(parseMoneyInput('1 450')).toBe(1450)
    expect(parseMoneyInput('1\u00a0450,00')).toBe(1450)
  })

  it('мусор и запреты → null', () => {
    expect(parseMoneyInput('')).toBeNull()
    expect(parseMoneyInput('abc')).toBeNull()
    expect(parseMoneyInput('-5')).toBeNull()
    expect(parseMoneyInput('1.234')).toBeNull()
    expect(parseMoneyInput('12,345')).toBeNull()
  })
})
