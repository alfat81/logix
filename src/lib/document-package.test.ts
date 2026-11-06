import { describe, expect, it } from 'vitest'
import { DOCUMENT_KIND_GROUPS } from '@/lib/document-phases'
import {
  DOCUMENT_KINDS,
  DOCUMENT_KIND_PROVIDERS,
  type DocumentStatus,
} from '@/lib/document-constants'
import {
  PACKAGE_ZIP_MAX_TOTAL_BYTES,
  attachRequirements,
  buildPackageSlots,
  packageEntryName,
  packageFinalSummary,
  packageFolderName,
  packageKindsForAudience,
  packageZipFileName,
  transliterateFileName,
  worstDocumentStatus,
} from '@/lib/document-package'
import type { DocumentRow } from '@/lib/documents'

// DF-13: сборка слотов пакета, сводка финальных и имена файлов ZIP.
// DocumentRow здесь — только поля, читаемые сборщиком (kind/type/isInternal/
// status/currentVersion/finalVersion/title/versions), поэтому фабрика
// делает минимальную заглушку с кастом до DocumentRow.

let seq = 0

function makeDoc(overrides: Partial<DocumentRow> & { status?: DocumentStatus }): DocumentRow {
  seq += 1
  return {
    id: `doc-${seq}`,
    type: 'other',
    kind: 'other',
    status: 'draft',
    finalizedAt: null,
    finalizedByName: null,
    finalVersion: null,
    stageCode: null,
    title: 'Документ',
    isInternal: false,
    currentVersion: 1,
    createdAt: new Date(2026, 0, 1).toISOString(),
    updatedAt: new Date(2026, 0, 1).toISOString(),
    versions: [],
    ...overrides,
  } as unknown as DocumentRow
}

function makeVersion(version: number, fileSize: number) {
  return {
    id: `ver-${version}-${fileSize}`,
    version,
    fileName: `file-v${version}.pdf`,
    mimeType: 'application/pdf',
    fileSize,
    status: 'ready',
    comment: null,
    authorType: 'employee',
    authorId: 'u1',
    authorName: 'Менеджер',
    createdAt: new Date(2026, 0, 1),
  }
}

describe('DF-13: packageKindsForAudience', () => {
  it('сотруднику — все 15 видов в порядке фазовых групп', () => {
    const kinds = packageKindsForAudience(true)
    expect(kinds).toHaveLength(DOCUMENT_KINDS.length)
    expect(new Set(kinds)).toEqual(new Set(DOCUMENT_KINDS))
    // порядок — flatten DOCUMENT_KIND_GROUPS
    expect(kinds).toEqual(DOCUMENT_KIND_GROUPS.flatMap((g) => [...g.kinds]))
  })

  it('внешним кабинетам подрядческие виды не раскрываются (DF-15)', () => {
    const kinds = packageKindsForAudience(false)
    expect(kinds).toHaveLength(DOCUMENT_KINDS.length - 3)
    expect(kinds).not.toContain('contractor_request')
    expect(kinds).not.toContain('contractor_agreement')
    expect(kinds).not.toContain('contractor_rates')
  })
})

describe('DF-13: DOCUMENT_KIND_PROVIDERS (дефолты до DF-14)', () => {
  it('partition: у каждого вида есть поставщик (или сознательный null)', () => {
    expect(Object.keys(DOCUMENT_KIND_PROVIDERS).sort()).toEqual([...DOCUMENT_KINDS].sort())
  })

  it('транспортные — сотрудник, ДТ/разрешительные — брокер, клиентские — клиент', () => {
    expect(DOCUMENT_KIND_PROVIDERS.bill_of_lading).toBe('staff')
    expect(DOCUMENT_KIND_PROVIDERS.cmr).toBe('staff')
    expect(DOCUMENT_KIND_PROVIDERS.awb).toBe('staff')
    expect(DOCUMENT_KIND_PROVIDERS.customs_declaration).toBe('broker')
    expect(DOCUMENT_KIND_PROVIDERS.proforma_invoice).toBe('client')
    expect(DOCUMENT_KIND_PROVIDERS.goods_description).toBe('client')
    expect(DOCUMENT_KIND_PROVIDERS.other).toBeNull()
  })
})

describe('DF-13: worstDocumentStatus — худший из статусов', () => {
  it.each([
    [['draft'] as DocumentStatus[], 'draft'],
    [['final'] as DocumentStatus[], 'final'],
    [['draft', 'final'] as DocumentStatus[], 'draft'],
    [['in_review', 'final'] as DocumentStatus[], 'in_review'],
    [['final', 'final'] as DocumentStatus[], 'final'],
  ])('%j → %s', (statuses, expected) => {
    expect(worstDocumentStatus(statuses)).toBe(expected)
  })
})

describe('DF-13: buildPackageSlots', () => {
  const kinds = packageKindsForAudience(true)

  it('пустой список — все слоты «нет» с поставщиками', () => {
    const slots = buildPackageSlots([], kinds)
    // DF-26: состав видов расширен до 19 — проверяем свойство «слот на каждый
    // вид аудитории», точный состав фиксирует document-constants.test.
    expect(slots).toHaveLength(kinds.length)
    expect(slots.every((s) => s.status === 'none')).toBe(true)
    expect(slots.every((s) => s.documents.length === 0)).toBe(true)
    expect(slots.find((s) => s.kind === 'other')?.provider).toBeNull()
  })

  it('несколько BL/CMR (мультимодальная): статус слота — худший из них', () => {
    const docs = [
      makeDoc({ kind: 'bill_of_lading', status: 'final', currentVersion: 2 }),
      makeDoc({ kind: 'bill_of_lading', status: 'draft' }),
      makeDoc({ kind: 'cmr', status: 'final' }),
      makeDoc({ kind: 'cmr', status: 'final' }),
    ]
    const slots = buildPackageSlots(docs, kinds)
    const bl = slots.find((s) => s.kind === 'bill_of_lading')!
    expect(bl.status).toBe('draft') // один черновик тянет слот вниз
    expect(bl.documents).toHaveLength(2)
    const cmr = slots.find((s) => s.kind === 'cmr')!
    expect(cmr.status).toBe('final')
    expect(cmr.documents).toHaveLength(2)
  })

  it('документ без kind (страховка чтения) резолвится по легаси-типу', () => {
    const slots = buildPackageSlots(
      [makeDoc({ kind: null, type: 'invoice' })],
      kinds,
    )
    const inv = slots.find((s) => s.kind === 'commercial_invoice')!
    expect(inv.documents).toHaveLength(1)
  })

  it('внутренний документ попадает в свой слот только при includeInternal', () => {
    const doc = makeDoc({ kind: 'contractor_rates', isInternal: true })
    const staff = buildPackageSlots([doc], packageKindsForAudience(true))
    expect(staff.find((s) => s.kind === 'contractor_rates')?.documents).toHaveLength(1)
    const external = buildPackageSlots([doc], packageKindsForAudience(false))
    expect(external.find((s) => s.kind === 'contractor_rates')).toBeUndefined()
  })

  it('порядок слотов — порядок переданных видов, документы сохраняют порядок списка', () => {
    const docs = [makeDoc({ kind: 'other', title: 'первый' }), makeDoc({ kind: 'other', title: 'второй' })]
    const slots = buildPackageSlots(docs, ['other', 'cmr'])
    expect(slots.map((s) => s.kind)).toEqual(['other', 'cmr'])
    expect(slots[0].documents.map((d) => d.title)).toEqual(['первый', 'второй'])
  })
})

describe('DF-13: packageFinalSummary', () => {
  it('считает только финальные и берёт размер их финальной версии', () => {
    const docs = [
      makeDoc({ kind: 'bill_of_lading', status: 'final', finalVersion: 2, currentVersion: 2,
        versions: [makeVersion(1, 100), makeVersion(2, 700)] }),
      makeDoc({ kind: 'commercial_invoice', status: 'draft', versions: [makeVersion(1, 500)] }),
      makeDoc({ kind: 'other', status: 'final', finalVersion: 1, versions: [makeVersion(1, 300)] }),
    ]
    const summary = packageFinalSummary(docs)
    expect(summary.count).toBe(2)
    expect(summary.totalBytes).toBe(700 + 300)
    expect(summary.zipAvailable).toBe(true)
  })

  it('пустой или переразмерный пакет — ZIP недоступен', () => {
    expect(packageFinalSummary([]).zipAvailable).toBe(false)
    const big = makeDoc({ kind: 'other', status: 'final', finalVersion: 1,
      versions: [makeVersion(1, PACKAGE_ZIP_MAX_TOTAL_BYTES + 1)] })
    expect(packageFinalSummary([big]).zipAvailable).toBe(false)
    expect(PACKAGE_ZIP_MAX_TOTAL_BYTES).toBe(4 * 1024 * 1024)
  })
})

describe('DF-13: транслитерация и имена файлов ZIP', () => {
  it('кириллица → латиница, регистр и цифры сохраняются', () => {
    expect(transliterateFileName('Инвойс №1 «ООО Ромб»')).toBe('Invoys-1-OOO-Romb')
    expect(transliterateFileName('ДТ ЖД-141 / исп.2')).toBe('DT-ZhD-141-isp.2')
  })

  it('пустое и мусорное имя даёт безопасную заглушку', () => {
    expect(transliterateFileName('')).toBe('doc')
    expect(transliterateFileName('___')).toBe('doc')
  })

  it('длинное имя обрезается до 80 символов без хвостового дефиса', () => {
    const out = transliterateFileName('очень длинное название документа '.repeat(5))
    expect(out.length).toBeLessThanOrEqual(80)
    expect(out.endsWith('-')).toBe(false)
  })

  it('имя файла версии: <вид>-<название>-v<версия>.<расширение>', () => {
    expect(packageEntryName('commercial_invoice', 'Инвойс №1', 2, 'INV.pdf'))
      .toBe('commercial-invoice-Invoys-1-v2.pdf')
    expect(packageEntryName('bill_of_lading', 'Коносамент (BL)', 1, 'BL_12.PDF'))
      .toBe('bill-of-lading-Konosament-BL-v1.pdf')
  })

  it('имя без расширения не оставляет висячей точки', () => {
    expect(packageEntryName('other', 'Акт', 3, 'act'))
      .toBe('other-Akt-v3')
  })

  it('папка и имя архива: номер заявки санитизируется (слэш выбрасывается)', () => {
    expect(packageFolderName('17-1')).toBe('17-1')
    expect(packageFolderName('АБ/12')).toBe('AB12')
    expect(packageZipFileName('17-1')).toBe('documents-17-1.zip')
  })
})

describe('DF-14: attachRequirements — чек-листы в слотах', () => {
  const kinds = packageKindsForAudience(true)
  const names = new Map([
    ['import_customs', 'Импортное таможенное оформление'],
    ['final_delivery', 'Доставка до получателя'],
  ])

  it('требования этапов заявки попадают в свои слоты (blocking в подписи)', () => {
    const slots = attachRequirements(
      buildPackageSlots([], kinds),
      ['import_customs'],
      [{ stageCode: 'import_customs', kind: 'customs_declaration', isBlocking: true }],
      names
    )
    const slot = slots.find((s) => s.kind === 'customs_declaration')
    expect(slot?.requiredFor).toEqual([
      { stageCode: 'import_customs', stageName: 'Импортное таможенное оформление', blocking: true },
    ])
    // чужие слоты пусты
    expect(slots.find((s) => s.kind === 'bill_of_lading')?.requiredFor).toEqual([])
  })

  it('требования этапов, которых нет на заявке, не попадают в слоты', () => {
    const slots = attachRequirements(
      buildPackageSlots([], kinds),
      ['final_delivery'],
      [{ stageCode: 'import_customs', kind: 'customs_declaration', isBlocking: true }],
      names
    )
    expect(slots.find((s) => s.kind === 'customs_declaration')?.requiredFor).toEqual([])
  })

  it('несколько этапов заявки с одним видом — обе строки, имя fallback на код', () => {
    // custom_stage есть на заявке, но нет в каталоге имён — fallback
    // на код (UI не ломается); этап вне заявки отфильтрован.
    const slots = attachRequirements(
      buildPackageSlots([], kinds),
      ['import_customs', 'final_delivery', 'custom_stage'],
      [
        { stageCode: 'import_customs', kind: 'permit_document', isBlocking: false },
        { stageCode: 'final_delivery', kind: 'permit_document', isBlocking: true },
        { stageCode: 'custom_stage', kind: 'permit_document', isBlocking: true },
        { stageCode: 'unknown_stage', kind: 'permit_document', isBlocking: true },
      ],
      names
    )
    const reqs = slots.find((s) => s.kind === 'permit_document')?.requiredFor ?? []
    expect(reqs).toHaveLength(3)
    expect(reqs.some((r) => r.stageName === 'custom_stage' && r.blocking)).toBe(true)
    expect(reqs.filter((r) => r.blocking)).toHaveLength(2)
  })

  it('внутренние виды (нет слота у внешних) просто не получают attach', () => {
    const staffKinds = packageKindsForAudience(false) // без contractor_*
    const slots = attachRequirements(
      buildPackageSlots([], staffKinds),
      ['import_customs'],
      [{ stageCode: 'import_customs', kind: 'contractor_rates', isBlocking: true }],
      names
    )
    expect(slots.find((s) => s.kind === 'contractor_rates')).toBeUndefined()
  })
})
