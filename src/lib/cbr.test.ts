import { describe, expect, it } from 'vitest'
import { parseCbrNumber, parseCbrXml, mskToday, cbrImportEnabled } from './cbr'

// DF-17: разбор официальной выгрузки ЦБ РФ (карточка: unit «разбор курсов
// (запятая как десятичный разделитель, номинал)»). Формат источника и
// условия использования — docs/REFERENCES-SOURCES.md.

describe('parseCbrNumber (формат ЦБ)', () => {
  it('запятая — десятичный разделитель', () => {
    expect(parseCbrNumber('79,7653')).toBeCloseTo(79.7653, 6)
    expect(parseCbrNumber('100,1')).toBeCloseTo(100.1, 6)
  })

  it('пробелы и неразрывные пробелы — мусор разрядов', () => {
    expect(parseCbrNumber('1 234,56')).toBeCloseTo(1234.56, 6)
    expect(parseCbrNumber('1\u00a0234,56')).toBeCloseTo(1234.56, 6)
  })

  it('целое число и точка тоже принимаются', () => {
    expect(parseCbrNumber('100')).toBe(100)
    expect(parseCbrNumber('1.5')).toBeCloseTo(1.5, 6)
  })

  it('мусор — null, а не исключение', () => {
    expect(parseCbrNumber('')).toBeNull()
    expect(parseCbrNumber('—')).toBeNull()
    expect(parseCbrNumber('12,34,56')).toBeNull()
    expect(parseCbrNumber('-5')).toBeNull()
    expect(parseCbrNumber('1e3')).toBeNull()
  })
})

// Минимальный фрагмент реальной выгрузки (windows-1251 уже декодирован):
// шапка с Date, CNY с VunitRate (новая выгрузка), JPY с номиналом 100,
// USD без VunitRate (старая выгрузка), битый блок без CharCode
// пропускается. Теги — как в XML_daily.asp: Nominal/Value/VunitRate.
const XML_SAMPLE = `<?xml version="1.0" encoding="windows-1251"?>
<ValCurs ID="R01235" DateRange="28.10.2026" Date="28.10.2026" name="Foreign Currency Market">
  <Valute ID="R01375">
    <NumCode>156</NumCode><CharCode>CNY</CharCode>
    <Nominal>1</Nominal><Name>Юань</Name><Value>11,0571</Value><VunitRate>11,0571</VunitRate>
  </Valute>
  <Valute ID="R01820">
    <NumCode>392</NumCode><CharCode>JPY</CharCode>
    <Nominal>100</Nominal><Name>100 Иен</Name><Value>52,4102</Value>
  </Valute>
  <Valute ID="R01215">
    <NumCode>840</NumCode><CharCode>USD</CharCode>
    <Nominal>1</Nominal><Name>Доллар США</Name><Value>81,3475</Value>
  </Valute>
  <Valute ID="R00000">
    <NumCode>000</NumCode><CharCode></CharCode>
    <Nominal>1</Nominal><Name>Битый блок</Name><Value>1,0000</Value>
  </Valute>
</ValCurs>`

describe('parseCbrXml (без зависимостей, формат источника)', () => {
  const parsed = parseCbrXml(XML_SAMPLE)

  it('дата из шапки ValCurs Date → ISO', () => {
    expect(parsed.date).toBe('2026-10-28')
  })

  it('VunitRate приоритетен (номинал уже учтён)', () => {
    const cny = parsed.rates.find((r) => r.code === 'CNY')
    expect(cny?.value).toBeCloseTo(11.0571, 6)
    expect(cny?.nominal).toBe(1)
  })

  it('номинал: JPY 100 единиц — Value/Номинал = курс одной единицы', () => {
    const jpy = parsed.rates.find((r) => r.code === 'JPY')
    expect(jpy?.nominal).toBe(100)
    // округление до 4 знаков — точность источника (Decimal(14,4) схемы)
    expect(jpy?.value).toBeCloseTo(0.5241, 4)
  })

  it('старая выгрузка без VunitRate — fallback Value/Номинал', () => {
    const usd = parsed.rates.find((r) => r.code === 'USD')
    expect(usd?.value).toBeCloseTo(81.3475, 6)
  })

  it('битый блок без CharCode пропускается; итог — 3 валюты', () => {
    expect(parsed.rates.map((r) => r.code).sort()).toEqual(['CNY', 'JPY', 'USD'])
  })

  it('нет даты в ответе — исключение с понятным текстом', () => {
    expect(() => parseCbrXml('<ValCurs></ValCurs>')).toThrow(/даты/)
  })

  it('значения ≤ 0 и мусорные строки отбрасываются', () => {
    const xml = `<ValCurs Date="28.10.2026">
      <Valute><CharCode>XXX</CharCode><Nominal>1</Nominal><Value>0,0000</Value></Valute>
      <Valute><CharCode>YYY</CharCode><Nominal>1</Nominal><Value>мусор</Value></Valute>
      <Valute><CharCode>ZZZ</CharCode><Nominal>1</Nominal><Value>5,0000</Value></Valute>
    </ValCurs>`
    const r = parseCbrXml(xml)
    expect(r.rates.map((x) => x.code)).toEqual(['ZZZ'])
  })
})

describe('выключатель и дата по МСК', () => {
  it('CBR_IMPORT=off выключает импорт (CI/e2e без внешней сети)', () => {
    const prev = process.env.CBR_IMPORT
    try {
      process.env.CBR_IMPORT = 'off'
      expect(cbrImportEnabled()).toBe(false)
      process.env.CBR_IMPORT = 'on'
      expect(cbrImportEnabled()).toBe(true)
      delete process.env.CBR_IMPORT
      expect(cbrImportEnabled()).toBe(true) // по умолчанию включён
    } finally {
      if (prev === undefined) delete process.env.CBR_IMPORT
      else process.env.CBR_IMPORT = prev
    }
  })

  it('mskToday — ISO-дата московского дня (формат en-CA)', () => {
    expect(mskToday()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
