// ─── DF-26: фазы документов заявки — единый источник группировки ────
// Спецификация «Единый центр документов заявки» ред. 1.4, §4.1: группировка
// реестра, структура ZIP и группировка селекта вида строятся из ОДНОГО
// источника. Фаза — производная вида (колонки в БД нет): существующие
// документы классифицируются автоматически, миграция не нужна.
// Файл БЕЗ серверных зависимостей (паттерн document-constants.ts):
// импортируется роутами, компонентами трёх кабинетов и unit-тестами.

import { DOCUMENT_KINDS, type DocumentKind } from '@/lib/document-constants'
import type { TransportTypeCode } from '@/lib/route-fields'

export const DOCUMENT_PHASES = [
  'preparation',
  'export',
  'international',
  'import_customs',
  'delivery',
  'closing',
  'permits',
  'internal',
  'misc',
] as const
export type DocumentPhase = (typeof DOCUMENT_PHASES)[number]

// Заголовок в реестре (нумерация 01–07 = порядок папок ZIP) и папка
// архива. misc — «Прочее» в корень архива (zipFolder null); internal —
// папка только в ZIP сотрудника (клиенту/брокеру фаза не показывается).
export const DOCUMENT_PHASE_META: Record<
  DocumentPhase,
  { label: string; zipFolder: string | null }
> = {
  preparation: { label: '01 · Подготовка и расчёт', zipFolder: '01_Подготовка' },
  export: { label: '02 · Экспортное оформление', zipFolder: '02_Экспортное_оформление' },
  international: { label: '03 · Международная перевозка', zipFolder: '03_Международная_перевозка' },
  import_customs: { label: '04 · Таможенное оформление в РФ', zipFolder: '04_Таможенное_оформление' },
  delivery: { label: '05 · Доставка по РФ и выдача', zipFolder: '05_Доставка' },
  closing: { label: '06 · Завершение', zipFolder: '06_Завершение' },
  permits: { label: '07 · Разрешительные документы', zipFolder: '07_Разрешительные_документы' },
  internal: { label: 'Внутренние документы', zipFolder: '08_Внутренние' },
  misc: { label: 'Прочее', zipFolder: null },
}

// Фаза каждого вида: состав фаз — §4.1 спецификации. permit_document —
// остаточная фаза 07 (требования с этапом попадают в фазу своего этапа
// в реестре, но файлы в ZIP всегда собираются в 07). Внутренние виды —
// фаза internal (клиенту/брокеру не показывается вовсе).
export const PHASE_OF_KIND: Record<DocumentKind, DocumentPhase> = {
  client_request: 'preparation',
  proforma_invoice: 'preparation',
  foreign_trade_contract: 'preparation',
  commercial_invoice: 'preparation',
  packing_list: 'preparation',
  goods_description: 'preparation',
  export_declaration: 'export',
  bill_of_lading: 'international',
  cmr: 'international',
  awb: 'international',
  railway_bill: 'international',
  customs_declaration: 'import_customs',
  delivery_confirmation: 'delivery',
  act_of_services: 'closing',
  permit_document: 'permits',
  contractor_request: 'internal',
  contractor_agreement: 'internal',
  contractor_rates: 'internal',
  other: 'misc',
}

// Резолв фазы строкой (легаси-строки без kind / чужие значения — «Прочее»).
export function phaseOfKind(kind: string | null | undefined): DocumentPhase {
  if (kind && (DOCUMENT_KINDS as readonly string[]).includes(kind)) {
    return PHASE_OF_KIND[kind as DocumentKind]
  }
  return 'misc'
}

// Папка ZIP для вида (misc — в корень архива).
export function zipFolderForKind(kind: string | null | undefined): string | null {
  return DOCUMENT_PHASE_META[phaseOfKind(kind)].zipFolder
}

// Соответствие фаз этапам заявки (§4.1 п. 4): фаза — группировка
// отображения, блокировки работают по этапам. Этапы без маппинга
// (склад, страхование) фазы не имеют — подсветка текущего этапа и
// строка разрешительного требования уходят в остаточную группу 07.
export const PHASE_OF_STAGE: Record<string, DocumentPhase> = {
  export_pickup: 'export',
  export_customs: 'export',
  loading: 'international',
  transport: 'international',
  import_customs: 'import_customs',
  final_delivery: 'delivery',
}

/** Фаза этапа заявки; null — этап без фазы (остаточная группа 07). */
export function phaseForStage(stageCode: string): DocumentPhase | null {
  return PHASE_OF_STAGE[stageCode] ?? null
}

// ── Логический тип «Транспортная накладная» (§4.3) ──────────────────
// Виды в БД сохраняются — параллельной сущности нет. Логический тип
// объединяет варианты: требование чек-листа на transport_document
// закрывается документом любого варианта, ZIP-слот агрегирует варианты
// в одной строке (фактический вид — в имени файла).
export const LOGICAL_DOC_TYPES = {
  transport_document: ['bill_of_lading', 'cmr', 'awb', 'railway_bill'],
} as const
export type LogicalDocType = keyof typeof LOGICAL_DOC_TYPES

export const LOGICAL_DOC_TYPE_LABELS: Record<LogicalDocType, string> = {
  transport_document: 'Транспортная накладная',
}

export function isLogicalDocType(kind: string): kind is LogicalDocType {
  return kind in LOGICAL_DOC_TYPES
}

/** Виды-варианты логического типа (для требования на конкретный вид — точное совпадение). */
export function kindsOfLogicalType(logical: LogicalDocType): readonly DocumentKind[] {
  return LOGICAL_DOC_TYPES[logical] as readonly DocumentKind[]
}

/** Все варианты транспортной накладной — один список с LOGICAL_DOC_TYPES. */
export const TRANSPORT_KINDS = kindsOfLogicalType('transport_document')

export function isTransportKind(kind: string): boolean {
  return (TRANSPORT_KINDS as readonly string[]).includes(kind)
}

// Подсказка варианта по типу перевозки заявки (§4.3.3): вид перевозки
// предлагает вариант накладной; у мультимодальной подсказки нет —
// допустимы все четыре (требование закрывается любым).
export const TRANSPORT_VARIANT_SUGGESTION: Record<TransportTypeCode, DocumentKind | null> = {
  sea: 'bill_of_lading',
  air: 'awb',
  auto: 'cmr',
  rail: 'railway_bill',
  multimodal: null,
}

export function suggestedTransportVariant(
  transportType: string | null | undefined,
): DocumentKind | null {
  if (!transportType) return null
  return TRANSPORT_VARIANT_SUGGESTION[transportType as TransportTypeCode] ?? null
}

// ── Производные группы видов (обратная совместимость DF-12/DF-13) ───
// Бывший ручной список групп расчёт/оформление/заявки заменён производным
// от фаз: группы селекта вида, порядок слотов пакета и структура ZIP —
// один источник. Группа internal у внешних читателей отрезается
// packageKindsForAudience (INTERNAL_ONLY_KINDS).
export const DOCUMENT_KIND_GROUPS: ReadonlyArray<{
  code: DocumentPhase
  label: string
  kinds: readonly DocumentKind[]
}> = DOCUMENT_PHASES.map((phase) => ({
  code: phase,
  label: DOCUMENT_PHASE_META[phase].label,
  kinds: DOCUMENT_KINDS.filter((k) => PHASE_OF_KIND[k] === phase),
}))
