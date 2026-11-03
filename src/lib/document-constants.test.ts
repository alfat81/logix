import { describe, expect, it } from 'vitest'
import {
  DOCUMENT_KINDS,
  DOCUMENT_KIND_GROUPS,
  DOCUMENT_KIND_LABELS,
  DOCUMENT_STATUSES,
  DOCUMENT_STATUS_LABELS,
  DOCUMENT_TYPES,
  INTERNAL_ONLY_KINDS,
  KIND_FOR_LEGACY_TYPE,
  LEGACY_TYPE_FOR_KIND,
  legacyKindFromType,
} from '@/lib/document-constants'

// DF-12: справочник видов (D5) — приёмка требует полноты и
// согласованности маппингов: группы покрывают список без дыр и дублей,
// легаси-производная type всегда валидна, обратный резолв определён
// для каждого легаси-типа.

describe('Справочник DOCUMENT_KINDS (DF-12)', () => {
  it('у каждого вида есть подпись, у каждой подписи — вид (в обе стороны)', () => {
    expect(Object.keys(DOCUMENT_KIND_LABELS).sort()).toEqual([...DOCUMENT_KINDS].sort())
  })

  it('группы покрывают все виды ровно по одному разу (partition)', () => {
    const seen: string[] = []
    for (const g of DOCUMENT_KIND_GROUPS) seen.push(...g.kinds)
    expect(seen.sort()).toEqual([...DOCUMENT_KINDS].sort())
    expect(new Set(seen).size).toBe(seen.length)
  })

  it('фазовый порядок карточки: Расчёт → Оформление и перевозка → служебные', () => {
    expect(DOCUMENT_KIND_GROUPS.map((g) => g.code)).toEqual([
      'calculation',
      'execution',
      'deals',
      'misc',
    ])
    expect(DOCUMENT_KIND_GROUPS[0].kinds).toEqual(['proforma_invoice', 'goods_description'])
  })

  it('паспортов в справочнике нет (D5)', () => {
    const joined = DOCUMENT_KINDS.join(' ')
    expect(joined).not.toContain('passport')
  })

  it('виды контура подрядчика — подмножество справочника и ровно три', () => {
    for (const k of INTERNAL_ONLY_KINDS) {
      expect(DOCUMENT_KINDS).toContain(k)
    }
    expect(INTERNAL_ONLY_KINDS).toHaveLength(3)
  })
})

describe('Легаси-маппинги type ↔ kind (окно expand до contract-релиза)', () => {
  it('LEGACY_TYPE_FOR_KIND определён для всех видов и даёт валидный type', () => {
    expect(Object.keys(LEGACY_TYPE_FOR_KIND).sort()).toEqual([...DOCUMENT_KINDS].sort())
    for (const legacy of Object.values(LEGACY_TYPE_FOR_KIND)) {
      expect(DOCUMENT_TYPES).toContain(legacy)
    }
  })

  it('KIND_FOR_LEGACY_TYPE определён для всех легаси-типов', () => {
    expect(Object.keys(KIND_FOR_LEGACY_TYPE).sort()).toEqual([...DOCUMENT_TYPES].sort())
  })

  it('backfill-пары карточки DF-12: invoice/customs/application/permit', () => {
    expect(KIND_FOR_LEGACY_TYPE.invoice).toBe('commercial_invoice')
    expect(KIND_FOR_LEGACY_TYPE.customs).toBe('customs_declaration')
    expect(KIND_FOR_LEGACY_TYPE.application).toBe('client_request')
    expect(KIND_FOR_LEGACY_TYPE.permit).toBe('permit_document')
  })

  it('contract: внутренний — договор с подрядчиком, внешний — other (чей — не определить)', () => {
    expect(legacyKindFromType('contract', true)).toBe('contractor_agreement')
    expect(legacyKindFromType('contract', false)).toBe('other')
  })

  it('проекция kind → type осмысленна для каждого вида (таблица карточки)', () => {
    // Проекция сознательно тернарна (type — легаси, 5 кодов на 15 видов):
    // фиксируем конкретные пары, которые читает код до contract-релиза.
    expect(LEGACY_TYPE_FOR_KIND.proforma_invoice).toBe('invoice')
    expect(LEGACY_TYPE_FOR_KIND.commercial_invoice).toBe('invoice')
    expect(LEGACY_TYPE_FOR_KIND.foreign_trade_contract).toBe('contract')
    expect(LEGACY_TYPE_FOR_KIND.contractor_agreement).toBe('contract')
    expect(LEGACY_TYPE_FOR_KIND.packing_list).toBe('accompanying')
    expect(LEGACY_TYPE_FOR_KIND.bill_of_lading).toBe('accompanying')
    expect(LEGACY_TYPE_FOR_KIND.cmr).toBe('accompanying')
    expect(LEGACY_TYPE_FOR_KIND.awb).toBe('accompanying')
    expect(LEGACY_TYPE_FOR_KIND.goods_description).toBe('accompanying')
    expect(LEGACY_TYPE_FOR_KIND.customs_declaration).toBe('customs')
    expect(LEGACY_TYPE_FOR_KIND.permit_document).toBe('permit')
    expect(LEGACY_TYPE_FOR_KIND.client_request).toBe('application')
    expect(LEGACY_TYPE_FOR_KIND.contractor_request).toBe('application')
    expect(LEGACY_TYPE_FOR_KIND.contractor_rates).toBe('other')
    expect(LEGACY_TYPE_FOR_KIND.other).toBe('other')
  })
})

describe('Статусы жизненного цикла документа (DF-12)', () => {
  it('три статуса, у каждого подпись (в обе стороны)', () => {
    expect(DOCUMENT_STATUSES).toEqual(['draft', 'in_review', 'final'])
    expect(Object.keys(DOCUMENT_STATUS_LABELS).sort()).toEqual([...DOCUMENT_STATUSES].sort())
  })
})
