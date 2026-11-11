import { describe, expect, it } from 'vitest'
import { buildChangedFields, changedFieldsSummary, OPTION_REVISION_KINDS } from './option-revisions'

// DF-27 волна 1 (план v1.2 §4): ревизии варианта — структурная история
// «кем/когда/что». Здесь — чистые функции (запись в транзакции покрыта
// e2e-сценариями 3–7).

describe('buildChangedFields', () => {
  it('только реально изменившиеся ключи, формат {from, to}', () => {
    const changed = buildChangedFields(
      { price: '1000', currency: 'RUB', description: 'Было' },
      { price: '1500', currency: 'RUB', description: 'Стало' }
    )
    expect(Object.keys(changed)).toEqual(['price', 'description'])
    expect(changed['price']).toEqual({ from: '1000', to: '1500' })
    expect(changed['description']).toEqual({ from: 'Было', to: 'Стало' })
  })

  it('undefined и null с обеих сторон нормализуются (null ?? null)', () => {
    const changed = buildChangedFields({ a: undefined }, { a: null })
    expect(changed).toEqual({})
    const changed2 = buildChangedFields({ a: null }, { a: 'x' })
    expect(changed2['a']).toEqual({ from: null, to: 'x' })
  })

  it('объекты сравниваются по стабильной JSON-сериализации', () => {
    const changed = buildChangedFields(
      { routeStops: [{ city: 'Ижевск' }] },
      { routeStops: [{ city: 'Казань' }] }
    )
    expect(changed['routeStops']).toEqual({
      from: [{ city: 'Ижевск' }],
      to: [{ city: 'Казань' }],
    })
    // порядок ключей внутри объекта не считается изменением
    expect(buildChangedFields({ s: { a: 1, b: 2 } }, { s: { b: 2, a: 1 } })).toEqual({})
  })

  it('ключ, появившийся или исчезнувший, — тоже изменение', () => {
    const added = buildChangedFields({}, { etaDays: 5 })
    expect(added['etaDays']).toEqual({ from: null, to: 5 })
    const removed = buildChangedFields({ note: 'x' }, {})
    expect(removed['note']).toEqual({ from: 'x', to: null })
  })

  it('агрегат строк расчёта кладётся вызывающей стороной и не теряется', () => {
    const changed = buildChangedFields(
      { calcLines: { count: 1, total: 100 } },
      { calcLines: { count: 2, total: 300 } }
    )
    expect(changed['calcLines']).toEqual({ from: { count: 1, total: 100 }, to: { count: 2, total: 300 } })
  })
})

describe('changedFieldsSummary', () => {
  it('человекочитаемое «ключ: старое → новое» через «; »', () => {
    const summary = changedFieldsSummary({
      price: { from: '1000', to: '1500' },
      currency: { from: 'RUB', to: 'USD' },
    })
    expect(summary).toBe('price: 1000 → 1500; currency: RUB → USD')
  })
  it('null/undefined → тире, объекты — JSON', () => {
    const summary = changedFieldsSummary({
      note: { from: null, to: 'заметка' },
      snap: { from: { a: 1 }, to: null },
    })
    expect(summary).toBe('note: — → заметка; snap: {"a":1} → —')
  })
})

describe('OPTION_REVISION_KINDS', () => {
  it('четыре вида ревизий плана §3 (created/updated/filled_from_lead/price_review_reset)', () => {
    expect([...OPTION_REVISION_KINDS].sort()).toEqual(
      ['created', 'filled_from_lead', 'price_review_reset', 'updated'].sort()
    )
  })
})
