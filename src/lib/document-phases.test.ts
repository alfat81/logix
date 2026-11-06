import { describe, expect, it } from 'vitest'
import {
  DOCUMENT_PHASES,
  DOCUMENT_PHASE_META,
  PHASE_OF_KIND,
  PHASE_OF_STAGE,
  phaseForStage,
  phaseOfKind,
  zipFolderForKind,
  LOGICAL_DOC_TYPES,
  LOGICAL_DOC_TYPE_LABELS,
  TRANSPORT_KINDS,
  TRANSPORT_VARIANT_SUGGESTION,
  isTransportKind,
  suggestedTransportVariant,
  DOCUMENT_KIND_GROUPS,
} from '@/lib/document-phases'
import { DOCUMENT_KINDS, INTERNAL_ONLY_KINDS } from '@/lib/document-constants'
import { TRANSPORT_TYPE_CODES } from '@/lib/route-fields'

// ─── DF-26 §4.1: фазы документов — приёмка требует полноты ──────────
// Фазы покрывают все 19 видов без дыр и дублей (одна фаза на вид),
// логический тип покрывает 4 транспортных вида, подсказка варианта
// полна по TransportTypeCode, внутренние виды не попадают во внешние
// фазы (клиент/брокер их не видят вовсе).

describe('Фазы документов (DOCUMENT_PHASES, DF-26 §4.1)', () => {
  it('9 фаз, у каждой подпись; misc — в корень архива', () => {
    expect(DOCUMENT_PHASES).toHaveLength(9)
    for (const p of DOCUMENT_PHASES) {
      expect(DOCUMENT_PHASE_META[p].label).toBeTruthy()
    }
    expect(DOCUMENT_PHASE_META.misc.zipFolder).toBeNull()
    expect(DOCUMENT_PHASE_META.preparation.zipFolder).toBe('01_Подготовка')
    expect(DOCUMENT_PHASE_META.permits.zipFolder).toBe('07_Разрешительные_документы')
    expect(DOCUMENT_PHASE_META.internal.zipFolder).toBe('08_Внутренние')
  })

  it('фазы покрывают все 19 видов ровно по одному разу (partition)', () => {
    // Partition — по видам: у каждого вида ровно одна фаза, ключи карты —
    // в точности DOCUMENT_KINDS; несколько видов делят одну фазу по дизайну §4.1.
    expect(Object.keys(PHASE_OF_KIND).sort()).toEqual([...DOCUMENT_KINDS].sort())
    for (const k of DOCUMENT_KINDS) {
      expect(DOCUMENT_PHASES).toContain(PHASE_OF_KIND[k])
    }
  })

  it('состав фаз §4.1: перевозка — семейство накладной, таможня — ДТ, 07 — permit_document', () => {
    expect(PHASE_OF_KIND.bill_of_lading).toBe('international')
    expect(PHASE_OF_KIND.cmr).toBe('international')
    expect(PHASE_OF_KIND.awb).toBe('international')
    expect(PHASE_OF_KIND.railway_bill).toBe('international')
    expect(PHASE_OF_KIND.export_declaration).toBe('export')
    expect(PHASE_OF_KIND.customs_declaration).toBe('import_customs')
    expect(PHASE_OF_KIND.delivery_confirmation).toBe('delivery')
    expect(PHASE_OF_KIND.act_of_services).toBe('closing')
    expect(PHASE_OF_KIND.permit_document).toBe('permits')
  })

  it('внутренние виды — только фаза internal, внешних видов там нет', () => {
    for (const k of INTERNAL_ONLY_KINDS) {
      expect(PHASE_OF_KIND[k]).toBe('internal')
    }
    const externalPhases = DOCUMENT_PHASES.filter((p) => p !== 'internal')
    for (const p of externalPhases) {
      const kinds = DOCUMENT_KINDS.filter((k) => PHASE_OF_KIND[k] === p)
      for (const k of kinds) {
        expect(INTERNAL_ONLY_KINDS).not.toContain(k)
      }
    }
  })

  it('резолв по строке: неизвестный/легаси без kind — «Прочее»', () => {
    expect(phaseOfKind('bill_of_lading')).toBe('international')
    expect(phaseOfKind(null)).toBe('misc')
    expect(phaseOfKind('no_such_kind')).toBe('misc')
  })

  it('папка ZIP для misc — корень архива', () => {
    expect(zipFolderForKind('other')).toBeNull()
    expect(zipFolderForKind('customs_declaration')).toBe('04_Таможенное_оформление')
  })

  it('производные группы совпадают с фазами (один источник с ZIP и селектом)', () => {
    expect(DOCUMENT_KIND_GROUPS.map((g) => g.code)).toEqual([...DOCUMENT_PHASES])
  })
})

describe('Соответствие фаз этапам заявки (PHASE_OF_STAGE)', () => {
  it('карта §4.1 п.4: экспорт/перевозка/таможня/доставка', () => {
    expect(PHASE_OF_STAGE.export_pickup).toBe('export')
    expect(PHASE_OF_STAGE.export_customs).toBe('export')
    expect(PHASE_OF_STAGE.loading).toBe('international')
    expect(PHASE_OF_STAGE.transport).toBe('international')
    expect(PHASE_OF_STAGE.import_customs).toBe('import_customs')
    expect(PHASE_OF_STAGE.final_delivery).toBe('delivery')
  })

  it('этап без фазы (склад, страхование) — null → остаточная группа 07', () => {
    expect(phaseForStage('warehouse_storage')).toBeNull()
    expect(phaseForStage('cargo_insurance')).toBeNull()
    expect(phaseForStage('import_customs')).toBe('import_customs')
  })
})

describe('Логический тип «Транспортная накладная» (§4.3)', () => {
  it('семейство покрывает ровно 4 транспортных вида', () => {
    expect(LOGICAL_DOC_TYPES.transport_document).toHaveLength(4)
    expect([...TRANSPORT_KINDS].sort()).toEqual(['awb', 'bill_of_lading', 'cmr', 'railway_bill'].sort())
    expect(LOGICAL_DOC_TYPE_LABELS.transport_document).toBe('Транспортная накладная')
  })

  it('подсказка варианта полна по TransportTypeCode; мультимодальная — без подсказки', () => {
    expect(Object.keys(TRANSPORT_VARIANT_SUGGESTION).sort()).toEqual([...TRANSPORT_TYPE_CODES].sort())
    expect(TRANSPORT_VARIANT_SUGGESTION.sea).toBe('bill_of_lading')
    expect(TRANSPORT_VARIANT_SUGGESTION.air).toBe('awb')
    expect(TRANSPORT_VARIANT_SUGGESTION.auto).toBe('cmr')
    expect(TRANSPORT_VARIANT_SUGGESTION.rail).toBe('railway_bill')
    expect(TRANSPORT_VARIANT_SUGGESTION.multimodal).toBeNull()
  })

  it('suggestedTransportVariant: неизвестный/пустой тип — null', () => {
    expect(suggestedTransportVariant('sea')).toBe('bill_of_lading')
    expect(suggestedTransportVariant(null)).toBeNull()
    expect(suggestedTransportVariant('hovercraft')).toBeNull()
  })

  it('isTransportKind: варианты — да, остальные — нет', () => {
    expect(isTransportKind('cmr')).toBe(true)
    expect(isTransportKind('customs_declaration')).toBe(false)
    expect(isTransportKind('transport_document')).toBe(false)
  })
})
