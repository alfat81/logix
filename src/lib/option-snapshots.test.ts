import { describe, expect, it } from 'vitest'
import {
  buildOptionSnapshots,
  buildRouteSnapshot,
  buildCargoSnapshot,
  applyOverrides,
  diffOptionVsLead,
  completeness,
  detectPriceSignificantChanges,
  ROUTE_SNAPSHOT_KEYS,
  OPTION_SNAPSHOT_VERSION,
  provenanceLabel,
} from './option-snapshots'

// DF-27 волна 1 (план v1.2 §3–§4, §6): снимки бланка запроса verbatim
// (правка №4 — полный состав анкеты, включая произвольные ключи
// cargoInfo), provenance, diff «вариант ↔ запрос», полнота.

const FULL_LEAD = {
  originCity: 'Шанхай',
  originCountry: 'Китай',
  originCountryCode: 'CN',
  destinationCity: 'Москва',
  destinationCountry: 'Россия',
  destinationCountryCode: 'RU',
  transportType: 'Морские',
  readyDate: new Date('2026-12-01T00:00:00.000Z'),
  incotermCode: 'FOB',
  incotermPlace: 'Шанхай',
  // P1-03: вес/объём/места — маршрутные колонки (не cargoInfo)
  weightKg: 1200,
  volumeM3: 8,
  placesCount: 10,
  cargoInfo: {
    cargoName: 'Станки',
    hsCode: '8413700008',
    placesCount: 10,
    weightKg: 1200,
    volumeM3: 8,
    cargoValue: '85000',
    dangerous: false,
    // Произвольные ключи бланка — в снимок verbatim (правка №4)
    metaCustom: { any: ['структура', 42] },
    vendorNote: 'произвольная заметка клиента',
  },
  wishes: null,
}

describe('buildRouteSnapshot', () => {
  it('все маршрутные ключи запроса переносятся, дата — yyyy-mm-dd без таймзонного сдвига', () => {
    const s = buildRouteSnapshot(FULL_LEAD)
    expect(s.v).toBe(OPTION_SNAPSHOT_VERSION)
    expect(Object.keys(s).sort()).toEqual(['v', ...ROUTE_SNAPSHOT_KEYS].sort())
    expect(s.originCity).toBe('Шанхай')
    expect(s.originCountryCode).toBe('CN')
    expect(s.destinationCity).toBe('Москва')
    expect(s.transportType).toBe('Морские')
    expect(s.readyDate).toBe('2026-12-01')
    expect(s.incotermCode).toBe('FOB')
    expect(s.incotermPlace).toBe('Шанхай')
  })

  it('пустые значения → null (толерантно к неполному запросу)', () => {
    const s = buildRouteSnapshot({ originCity: '  ' })
    expect(s.originCity).toBeNull()
    expect(s.readyDate).toBeNull()
    expect(s.destinationCity).toBeNull()
  })
})

describe('buildCargoSnapshot / buildOptionSnapshots', () => {
  it('грузовой бланк verbatim: известные ключи И произвольные ключи cargoInfo', () => {
    const s = buildCargoSnapshot(FULL_LEAD)
    expect(s.v).toBe(OPTION_SNAPSHOT_VERSION)
    expect(s.cargo).toEqual(FULL_LEAD.cargoInfo)
    expect(s.cargo['metaCustom']).toEqual(FULL_LEAD.cargoInfo['metaCustom'])
    expect(s.cargo['vendorNote']).toBe('произвольная заметка клиента')
    expect(s.wishes).toBeNull()
  })

  it('cargoInfo не-объект → пустой груз (не падает)', () => {
    expect(buildCargoSnapshot({ cargoInfo: 'битые данные' }).cargo).toEqual({})
    expect(buildCargoSnapshot({ cargoInfo: [1, 2] }).cargo).toEqual({})
    expect(buildCargoSnapshot({}).cargo).toEqual({})
  })

  it('sourceFields полон: все маршрутные ключи + все ключи груза', () => {
    const { sourceFields } = buildOptionSnapshots(FULL_LEAD)
    for (const k of ROUTE_SNAPSHOT_KEYS) expect(sourceFields).toContain(`route.${k}`)
    expect(sourceFields).toContain('cargo.cargoName')
    expect(sourceFields).toContain('cargo.hsCode')
    expect(sourceFields).toContain('cargo.metaCustom')
    expect(sourceFields).toContain('cargo.vendorNote')
    // wishes запроса null → в sourceFields не попадает
    expect(sourceFields).not.toContain('wishes')
  })
})

describe('applyOverrides', () => {
  const base = buildOptionSnapshots(FULL_LEAD)

  it('переопределения уходят в editedFields и выпадают из sourceFields', () => {
    const r = applyOverrides(base, {
      route: { destinationCity: 'Санкт-Петербург', transportType: 'Авиа' },
      cargo: { cargoValue: '90000' },
      routeStops: [{ city: 'Ижевск', country: null, note: null }],
      wishes: 'Побыстрее',
    })
    expect(r.routeSnapshot.destinationCity).toBe('Санкт-Петербург')
    expect(r.routeSnapshot.transportType).toBe('Авиа')
    expect(r.routeSnapshot.originCity).toBe('Шанхай') // нетронутое — как в запросе
    expect(r.cargoSnapshot.cargo['cargoValue']).toBe('90000')
    expect(r.cargoSnapshot.cargo['cargoName']).toBe('Станки')
    expect(r.cargoSnapshot.wishes).toBe('Побыстрее')
    expect(r.routeStops).toEqual([{ city: 'Ижевск', country: null, note: null }])
    expect(r.editedFields).toEqual(
      expect.arrayContaining([
        'route.destinationCity',
        'route.transportType',
        'cargo.cargoValue',
        'routeStops',
        'wishes',
      ])
    )
    expect(r.sourceFields).not.toContain('route.destinationCity')
    expect(r.sourceFields).not.toContain('cargo.cargoValue')
    expect(r.sourceFields).toContain('route.originCity')
    expect(r.sourceFields).toContain('cargo.cargoName')
  })

  it('null в override = очистка значения (PATCH-семантика лида)', () => {
    const r = applyOverrides(base, { cargo: { vendorNote: null }, wishes: null })
    expect(r.cargoSnapshot.cargo['vendorNote']).toBeUndefined()
    expect(r.cargoSnapshot.wishes).toBeNull()
    expect(r.editedFields).toContain('cargo.vendorNote')
    expect(r.editedFields).toContain('wishes')
  })

  it('cargo: null — полная очистка груза; routeStops: null — очистка точек', () => {
    const r = applyOverrides(base, { cargo: null, routeStops: null })
    expect(r.cargoSnapshot.cargo).toEqual({})
    expect(r.routeStops).toBeNull()
  })

  it('неизвестный маршрутный ключ игнорируется (защита от мусора)', () => {
    const r = applyOverrides(base, { route: { hackerKey: 'x' } as Record<string, unknown> })
    expect(r.editedFields).toEqual([])
    expect(r.sourceFields).toEqual(base.sourceFields)
  })
})

describe('diffOptionVsLead', () => {
  it('изменённые ключи — расхождения; совпадающие и отсутствующие в запросе — нет', () => {
    const base = buildOptionSnapshots(FULL_LEAD)
    const applied = applyOverrides(base, {
      route: { destinationCity: 'Санкт-Петербург' },
      cargo: { cargoValue: '90000', newKey: 'новое' },
    })
    const option = { routeSnapshot: applied.routeSnapshot, cargoSnapshot: applied.cargoSnapshot }
    const diff = diffOptionVsLead(FULL_LEAD, option)
    expect(diff).not.toBeNull()
    const keys = (diff ?? []).map((d) => d.key)
    expect(keys).toContain('route.destinationCity')
    expect(keys).toContain('cargo.cargoValue')
    // newKey отсутствует в запросе — сравнивать нечего, в diff не входит
    expect(keys).not.toContain('cargo.newKey')
    expect(keys).not.toContain('route.originCity')
    const dest = (diff ?? []).find((d) => d.key === 'route.destinationCity')
    expect(dest?.lead).toBe('Москва')
    expect(dest?.option).toBe('Санкт-Петербург')
  })

  it('легаси-вариант (без снимков) → null — сравнивать нечего', () => {
    expect(diffOptionVsLead(FULL_LEAD, {})).toBeNull()
    expect(diffOptionVsLead(FULL_LEAD, { routeSnapshot: null, cargoSnapshot: null })).toBeNull()
  })

  it('чужая структура снимков не роняет проекцию', () => {
    expect(diffOptionVsLead(FULL_LEAD, { routeSnapshot: 'мусор', cargoSnapshot: 42 })).toBeNull()
  })

  it('числа сравниваются по значению (1200 = «1200.0»)', () => {
    const option = {
      routeSnapshot: { ...buildRouteSnapshot(FULL_LEAD), originCity: 'Шанхай' },
      cargoSnapshot: buildCargoSnapshot({ cargoInfo: { weightKg: '1200.0' } }),
    }
    const diff = diffOptionVsLead(FULL_LEAD, option)
    expect((diff ?? []).map((d) => d.key)).not.toContain('cargo.weightKg')
  })
})

describe('completeness', () => {
  it('полный запрос — ready, missing пуст', () => {
    const c = completeness(FULL_LEAD)
    expect(c.ready).toBe(true)
    expect(c.missing).toEqual([])
  })

  it('критичные параметры: точки, дата, вес ИЛИ объём, места, ТН ВЭД, стоимость, Инкотермс', () => {
    const c = completeness({ cargoInfo: {} })
    expect(c.ready).toBe(false)
    expect(c.missing).toEqual([
      'Пункт отправления',
      'Пункт прибытия',
      'Дата готовности груза',
      'Вес или объём',
      'Количество мест',
      'Код ТН ВЭД',
      'Стоимость груза',
      'Условия поставки (Инкотермс)',
    ])
  })

  it('вес ИЛИ объём — достаточно одного', () => {
    const c = completeness({ ...FULL_LEAD, volumeM3: undefined })
    expect(c.missing).not.toContain('Вес или объём')
    const c2 = completeness({ ...FULL_LEAD, weightKg: undefined })
    expect(c2.missing).not.toContain('Вес или объём')
    const c3 = completeness({ ...FULL_LEAD, weightKg: undefined, volumeM3: undefined })
    expect(c3.missing).toContain('Вес или объём')
  })

  it('снимки варианта переопределяют запрос (эффективный вид)', () => {
    // запрос неполный, вариант дозаполняет снимками
    const lead = { ...FULL_LEAD, cargoInfo: {} }
    const base = buildOptionSnapshots(FULL_LEAD)
    const applied = applyOverrides(base, { cargo: { hsCode: '8413700008', cargoValue: '85000' } })
    const c = completeness(lead, {
      routeSnapshot: applied.routeSnapshot,
      cargoSnapshot: applied.cargoSnapshot,
    })
    // маршрут/дата/инкотермс из запроса есть; вес/места есть в запросе
    expect(c.ready).toBe(true)
  })
})

describe('detectPriceSignificantChanges', () => {
  it('изменение ценозначимых ключей даёт перечень человекочитаемых подписей', () => {
    const changed = detectPriceSignificantChanges(FULL_LEAD, {
      route: { weightKg: 1500, readyDate: '2026-12-05' },
      mergedCargo: { ...FULL_LEAD.cargoInfo, cargoValue: '99000' },
      incotermCode: undefined,
    })
    expect(changed).toContain('Вес')
    expect(changed).toContain('Дата готовности')
    expect(changed).toContain('Стоимость груза')
    expect(changed).not.toContain('Куда') // destinationCity не трогали
  })

  it('неценообразующие правки (грузовое имя) — пустой перечень', () => {
    const changed = detectPriceSignificantChanges(FULL_LEAD, {
      mergedCargo: { ...FULL_LEAD.cargoInfo, cargoName: 'Новое имя' },
    })
    expect(changed).toEqual([])
  })
})

describe('provenanceLabel', () => {
  it('известные ключи — словарные подписи, произвольные cargo.* — имя ключа', () => {
    expect(provenanceLabel('route.originCity')).toBe('Пункт отправления')
    expect(provenanceLabel('cargo.hsCode')).toBe('Код ТН ВЭД')
    expect(provenanceLabel('cargo.metaCustom')).toBe('metaCustom')
    expect(provenanceLabel('routeStops')).toBe('Промежуточные точки')
  })
})
