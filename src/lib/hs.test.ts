import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import {
  escapeHsLike,
  hsPrefixRange,
  isHsCodeQuery,
  isHsValidOn,
  matchHsName,
  normalizeHsQuery,
  planHsImport,
} from './hs'

// DF-17C: чистые функции без БД (карточка: unit «поиск по префиксу и
// названию, версии (код действовал на дату), импорт повторно не
// дублирует»). Данные снапшота — scripts/ref-data/hs/tnved-tws.json.

describe('normalizeHsQuery (с пробелами и без — карточка)', () => {
  it('пробелы и разделители выкидываются', () => {
    expect(normalizeHsQuery('0101 21')).toBe('010121')
    expect(normalizeHsQuery('0101-21-00')).toBe('01012100')
    expect(normalizeHsQuery('  8541 ')).toBe('8541')
    expect(normalizeHsQuery('01.01.21')).toBe('010121')
  })
  it('названия остаются как есть (без пробелов внутри)', () => {
    expect(normalizeHsQuery('коровы')).toBe('коровы')
    expect(normalizeHsQuery('молотки  металлические')).toBe('молоткиметаллические')
  })
})

describe('isHsCodeQuery (цифры → код, иначе → название)', () => {
  it('цифровой запрос — поиск по коду', () => {
    expect(isHsCodeQuery('010121')).toBe(true)
    expect(isHsCodeQuery('0101 21')).toBe(true)
  })
  it('с буквами — поиск по названию', () => {
    expect(isHsCodeQuery('коровы')).toBe(false)
    expect(isHsCodeQuery('0101а')).toBe(false)
    expect(isHsCodeQuery('')).toBe(false)
  })
})

describe('hsPrefixRange (границы btree-диапазона)', () => {
  it('префикс середины — [pref, pref+1)', () => {
    expect(hsPrefixRange('0101')).toEqual({ gte: '0101', lt: '0102' })
    expect(hsPrefixRange('8541')).toEqual({ gte: '8541', lt: '8542' })
  })
  it('хвостовые девятки переносятся', () => {
    expect(hsPrefixRange('0199')).toEqual({ gte: '0199', lt: '0200' })
    expect(hsPrefixRange('010199')).toEqual({ gte: '010199', lt: '010200' })
  })
  it('полный код — диапазон в один код', () => {
    expect(hsPrefixRange('0101210000')).toEqual({ gte: '0101210000', lt: '0101210001' })
  })
  it('все девятки — верхней границы нет', () => {
    expect(hsPrefixRange('9999')).toEqual({ gte: '9999', lt: null })
  })
})

describe('isHsValidOn (версии: код действовал на дату)', () => {
  const open = { validFrom: '2026-10-28', validTo: null }
  const closed = { validFrom: '2026-01-01', validTo: '2026-10-28' }

  it('открытая редакция действует с даты начала', () => {
    expect(isHsValidOn(open, '2026-10-28')).toBe(true)
    expect(isHsValidOn(open, '2026-12-01')).toBe(true)
    expect(isHsValidOn(open, '2026-10-27')).toBe(false)
  })
  it('закрытая редакция: [from, to)', () => {
    expect(isHsValidOn(closed, '2026-10-27')).toBe(true)
    expect(isHsValidOn(closed, '2026-10-28')).toBe(false)
    expect(isHsValidOn(closed, '2025-12-31')).toBe(false)
  })
  it('работает с Date и не зависит от времени суток', () => {
    expect(isHsValidOn(open, new Date(2026, 9, 28))).toBe(true)
    expect(isHsValidOn(closed, new Date(2026, 9, 27, 23, 59))).toBe(true)
  })
})

describe('matchHsName (поиск по названию, регистр не важен)', () => {
  const ROWS = [
    { code: '0102213000', name: 'крупный рогатый скот / коровы' },
    { code: '8205200000', name: 'молотки металлические / молотки с другими рабочими частями' },
    { code: '8205590000', name: 'прочие ручные инструменты / прочие' },
  ]
  it('вхождение в середину пути', () => {
    expect(matchHsName(ROWS, 'коровы').map((r) => r.code)).toEqual(['0102213000'])
    expect(matchHsName(ROWS, 'Коровы').map((r) => r.code)).toEqual(['0102213000'])
    expect(matchHsName(ROWS, 'молотки').map((r) => r.code)).toEqual(['8205200000'])
  })
  it('пустой запрос — всё', () => {
    expect(matchHsName(ROWS, '  ')).toHaveLength(3)
  })
})

describe('escapeHsLike (спецсимволы LIKE не ломают поиск)', () => {
  it('экранирует %, _ и \\', () => {
    expect(escapeHsLike('100%')).toBe('100\\%')
    expect(escapeHsLike('a_b')).toBe('a\\_b')
    expect(escapeHsLike('a\\b')).toBe('a\\\\b')
  })
})

describe('planHsImport (повторный импорт не дублирует; старее — отказ)', () => {
  it('новая редакция — вставка', () => {
    expect(planHsImport(['2026-10-28'], '2027-01-01')).toBe('fresh')
    expect(planHsImport([], '2026-10-28')).toBe('fresh')
  })
  it('та же редакция — ничего не писать', () => {
    expect(planHsImport(['2026-10-28'], '2026-10-28')).toBe('same')
    expect(planHsImport(['2026-10-28', '2027-01-01'], '2026-10-28')).toBe('same')
  })
  it('редакция старее существующей — отказ (история)', () => {
    expect(planHsImport(['2027-01-01'], '2026-10-28')).toBe('older')
  })
})

describe('снапшот scripts/ref-data/hs/tnved-tws.json (санитария данных)', () => {
  const RAW = JSON.parse(
    readFileSync(new URL('../../scripts/ref-data/hs/tnved-tws.json', import.meta.url), 'utf8')
  ) as {
    version: string
    source: string
    items: { code: string; name: string; etdDutyText: string | null }[]
  }

  it('версия и источник заполнены', () => {
    expect(RAW.version).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(RAW.source).toContain('tws.by')
  })
  it('все коды 10 цифр и уникальны (импорт не даст дублей)', () => {
    const codes = RAW.items.map((i) => i.code)
    expect(codes.every((c) => /^\d{10}$/.test(c))).toBe(true)
    expect(new Set(codes).size).toBe(codes.length)
    expect(codes.length).toBeGreaterThan(12000)
  })
  it('имена непустые и без маркеров источника (🠺 заменён)', () => {
    expect(RAW.items.every((i) => i.name.length > 0)).toBe(true)
    expect(RAW.items.some((i) => i.name.includes('🠺'))).toBe(false)
  })
})
