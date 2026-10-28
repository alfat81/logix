import { describe, expect, it } from 'vitest'
import {
  REF_DIRS,
  isRefDir,
  normalizeRefCode,
  refCodeField,
  currencyCodeSchema,
  matchRefOptions,
  incotermMetaOf,
  PLACE_KIND_LABELS,
  INCOTERM_TRANSPORT_LABELS,
} from './ref'

// DF-17: платформа справочников — чистые функции без БД (карточка:
// unit «поиск (регистр, префикс кода)», «правила Инкотермс как данные»).

const ITEMS = [
  { code: 'CN', name: 'Китай', nameEn: 'China' },
  { code: 'CO', name: 'Колумбия', nameEn: 'Colombia' },
  { code: 'RU', name: 'Россия', nameEn: 'Russia' },
  { code: 'SA', name: 'Саудовская Арабия', nameEn: 'Saudi Arabia' },
] as const

describe('matchRefOptions (поиск по справочнику)', () => {
  it('пустой q — все записи', () => {
    expect(matchRefOptions(ITEMS, '')).toHaveLength(4)
    expect(matchRefOptions(ITEMS, '   ')).toHaveLength(4)
  })

  it('регистр не важен: код целиком и префикс', () => {
    expect(matchRefOptions(ITEMS, 'cn').map((i) => i.code)).toEqual(['CN'])
    expect(matchRefOptions(ITEMS, 'CN').map((i) => i.code)).toEqual(['CN'])
    expect(matchRefOptions(ITEMS, 'c').map((i) => i.code)).toEqual(['CN', 'CO'])
  })

  it('вхождение в русское имя', () => {
    expect(matchRefOptions(ITEMS, 'Кит').map((i) => i.code)).toEqual(['CN'])
    expect(matchRefOptions(ITEMS, 'кит').map((i) => i.code)).toEqual(['CN'])
  })

  it('латиницей — по nameEn', () => {
    expect(matchRefOptions(ITEMS, 'china').map((i) => i.code)).toEqual(['CN'])
    expect(matchRefOptions(ITEMS, 'Sau').map((i) => i.code)).toEqual(['SA'])
  })

  it('нет совпадений — пусто', () => {
    expect(matchRefOptions(ITEMS, 'япония')).toEqual([])
  })
})

describe('dir-ы и коды', () => {
  it('whitelist dir закрыт', () => {
    expect(REF_DIRS).toEqual(['country', 'currency', 'packaging', 'incoterm'])
    expect(isRefDir('country')).toBe(true)
    expect(isRefDir('place')).toBe(false)
    expect(isRefDir(42)).toBe(false)
  })

  it('нормализация кода — trim + верхний регистр', () => {
    expect(normalizeRefCode('country', ' cn ')).toBe('CN')
    expect(normalizeRefCode('incoterm', 'fob')).toBe('FOB')
  })

  it('refCodeField: код без пробелов, верхний регистр, nullable/optional', () => {
    const f = refCodeField('Страна')
    expect(f.parse('cn')).toBe('CN')
    expect(f.parse(null)).toBeNull()
    expect(f.parse(undefined)).toBeUndefined()
    expect(f.safeParse('С Ш').success).toBe(false)
    expect(f.safeParse('VERYLONGCODE1').success).toBe(false)
  })

  it('валюта — ровно три буквы ISO', () => {
    expect(currencyCodeSchema.parse('usd')).toBe('USD')
    expect(currencyCodeSchema.safeParse('RUB!').success).toBe(false)
    expect(currencyCodeSchema.safeParse('RU').success).toBe(false)
  })
})

describe('incotermMetaOf (правила Инкотермс — данные в meta)', () => {
  it('полный meta разбирается по типу', () => {
    const meta = incotermMetaOf({
      explanation: 'Риск у борта судна',
      transport: ['sea'],
      placeKind: 'port_dispatch',
      addFreightToArrival: true,
      addInsurance: true,
      deductPostArrival: false,
      warning: 'Контейнеры — FCA',
      draft: true,
    })
    expect(meta).toEqual({
      explanation: 'Риск у борта судна',
      transport: ['sea'],
      placeKind: 'port_dispatch',
      addFreightToArrival: true,
      addInsurance: true,
      deductPostArrival: false,
      warning: 'Контейнеры — FCA',
      draft: true,
    })
  })

  it('draft по умолчанию true — флаги черновик до утверждения брокером (O-12)', () => {
    const meta = incotermMetaOf({ explanation: 'x', transport: ['any'], placeKind: 'origin' })
    expect(meta?.draft).toBe(true)
    expect(meta?.addFreightToArrival).toBe(false)
    expect(meta?.addInsurance).toBe(false)
    expect(meta?.deductPostArrival).toBe(false)
    expect(meta?.warning).toBeUndefined()
  })

  it('мусор в meta — null, а не падение (снимки старых записей)', () => {
    expect(incotermMetaOf(null)).toBeNull()
    expect(incotermMetaOf('FOB')).toBeNull()
    expect(incotermMetaOf([1, 2])).toBeNull()
    expect(incotermMetaOf({ explanation: 'x' })).toBeNull() // нет placeKind
    expect(incotermMetaOf({ transport: [], placeKind: 'origin' })).toBeNull() // нет explanation
  })

  it('подписи placeKind и транспорта на русском', () => {
    expect(PLACE_KIND_LABELS.origin).toContain('отправителя')
    expect(PLACE_KIND_LABELS.port_arrival).toContain('порт')
    expect(INCOTERM_TRANSPORT_LABELS.any).toContain('любой')
    expect(INCOTERM_TRANSPORT_LABELS.sea).toContain('морской')
  })
})
