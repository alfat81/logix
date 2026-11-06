import { describe, expect, it } from 'vitest'
import { lastReadyVersion, planScopeZip, type ZipScopeItem } from './document-zip-plan'
import type { DocumentRow } from './documents'

// ─── DF-26 §8: план ZIP «все доступные»/«выбранные» — unit (T21-04) ──
// Структура папок по фазам (§8.2), исходные имена (транслитерация),
// суффиксы коллизий « (vN)» → « (2)» (§8.2.2), счётчики предупреждения
// из ОДНОГО списка с составом архива (§8.1.3 — расхождение исключено
// по построению). Носитель — отдельный файл: §13.1 называет
// document-package.test.ts, но он уже 287 строк при лимите 300
// (RULES 2.14, IC-09); отклонение — в отчёте гейта 1 (В-5).

const item = (over: Partial<ZipScopeItem>): ZipScopeItem => ({
  documentId: 'doc-1',
  kind: 'proforma_invoice',
  type: 'accompanying',
  isInternal: false,
  title: 'Проформа-инвойс',
  status: 'final',
  versionId: 'v1',
  version: 1,
  fileName: 'proforma.pdf',
  fileSize: 100,
  ...over,
})

describe('planScopeZip: структура архива (§8.2)', () => {
  it('папка фазы по PHASE_OF_KIND, корень — номер заявки', () => {
    const plan = planScopeZip('12-3', [
      item({}),
      item({ documentId: 'd2', kind: 'customs_declaration', title: 'ДТ', fileName: 'dt.pdf' }),
      item({ documentId: 'd3', kind: 'other', type: 'other', title: 'Прочее' }),
      item({ documentId: 'd4', kind: 'contractor_agreement', type: 'contract', isInternal: true, title: 'Договор' }),
    ])
    expect(plan.entries[0].path).toBe('12-3/01_Подготовка/proforma-invoice-Proforma-invoys-v1.pdf')
    expect(plan.entries[1].path).toBe('12-3/04_Таможенное_оформление/customs-declaration-DT-v1.pdf')
    // misc — в корень архива (zipFolder null)
    expect(plan.entries[2].path).toBe('12-3/other-Prochee-v1.pdf')
    // внутренние виды — папка 08 (в ZIP сотрудника)
    expect(plan.entries[3].path).toBe('12-3/08_Внутренние/contractor-agreement-Dogovor-v1.pdf')
  })

  it('исходное имя файла даёт расширение; кириллица транслитерируется', () => {
    const plan = planScopeZip('17-1', [
      item({ kind: 'bill_of_lading', title: 'Коносамент (B/L)', fileName: 'Накладная №1.PDF' }),
    ])
    expect(plan.entries[0].name).toBe('03_Международная_перевозка/bill-of-lading-Konosament-BL-v1.pdf')
    expect(plan.entries[0].path).toBe('17-1/' + plan.entries[0].name)
  })
})

describe('planScopeZip: коллизии имён в одной папке (§8.2.2)', () => {
  it('вторая копия — « (vN)» по номеру версии, третья — « (2)»', () => {
    const plan = planScopeZip('12-3', [
      item({ documentId: 'a', version: 2 }),
      item({ documentId: 'b', version: 2, fileName: 'proforma.pdf' }),
      item({ documentId: 'c', version: 2, fileName: 'proforma.pdf' }),
    ])
    const names = plan.entries.map((e) => e.name)
    expect(names[0]).toBe('01_Подготовка/proforma-invoice-Proforma-invoys-v2.pdf')
    expect(names[1]).toBe('01_Подготовка/proforma-invoice-Proforma-invoys-v2 (v2).pdf')
    expect(names[2]).toBe('01_Подготовка/proforma-invoice-Proforma-invoys-v2 (2).pdf')
    // все пути уникальны
    expect(new Set(plan.entries.map((e) => e.path)).size).toBe(3)
  })

  it('коллизии в РАЗНЫХ папках не конфликтуют (папка — часть ключа)', () => {
    const plan = planScopeZip('12-3', [
      item({ documentId: 'a', title: 'Акт' }),
      item({ documentId: 'b', kind: 'act_of_services', title: 'Акт' }),
    ])
    expect(plan.entries[0].name).toBe('01_Подготовка/proforma-invoice-Akt-v1.pdf')
    expect(plan.entries[1].name).toBe('06_Завершение/act-of-services-Akt-v1.pdf')
  })
})

describe('planScopeZip: счётчики предупреждения = состав архива (§8.1.3)', () => {
  it('nonFinalDrafts/nonFinalReview считаются по тому же списку, что и entries', () => {
    const items = [
      item({ documentId: 'a', status: 'draft' }),
      item({ documentId: 'b', status: 'draft' }),
      item({ documentId: 'c', status: 'in_review' }),
      item({ documentId: 'd', status: 'final' }),
    ]
    const plan = planScopeZip('12-3', items)
    expect(plan.nonFinalDrafts).toBe(2)
    expect(plan.nonFinalReview).toBe(1)
    // один список: счётчик == фильтр по entries (расхождение исключено)
    expect(plan.nonFinalDrafts).toBe(plan.entries.filter((e) => e.item.status === 'draft').length)
    expect(plan.nonFinalReview).toBe(plan.entries.filter((e) => e.item.status === 'in_review').length)
  })

  it('totalBytes — сумма размеров вошедших версий', () => {
    const plan = planScopeZip('12-3', [
      item({ documentId: 'a', fileSize: 1024 }),
      item({ documentId: 'b', fileSize: 2048 }),
    ])
    expect(plan.totalBytes).toBe(3072)
  })
})

describe('lastReadyVersion: последняя готовая версия (§8.1.3)', () => {
  it('первая версия из отсортированного списка (version desc) — не finalVersion ?? current', () => {
    const doc = {
      versions: [
        { id: 'v3', version: 3, fileName: 'akt-v3.pdf', fileSize: 30 },
        { id: 'v2', version: 2, fileName: 'akt-v2.pdf', fileSize: 20 },
      ],
    } as unknown as DocumentRow
    expect(lastReadyVersion(doc)).toEqual({ id: 'v3', version: 3, fileName: 'akt-v3.pdf', fileSize: 30 })
  })

  it('документ без готовых версий — null (в архив не попадает)', () => {
    expect(lastReadyVersion({ versions: [] } as unknown as DocumentRow)).toBeNull()
  })
})
