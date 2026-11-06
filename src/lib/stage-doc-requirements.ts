import {
  DOCUMENT_KINDS,
  DOCUMENT_KIND_LABELS,
  type DocProvider,
  type DocumentKind,
} from '@/lib/document-constants'
import {
  isLogicalDocType,
  kindsOfLogicalType,
  LOGICAL_DOC_TYPE_LABELS,
  type LogicalDocType,
} from '@/lib/document-phases'

// ─── DF-14: чек-листы обязательных документов по этапам — чистое ядро ─
// Требование = «для этапа X нужен документ вида K, предоставляет его
// сторона P, завершение этапа без финального документа блокируется».
// Модуль БЕЗ серверных зависимостей (паттерн waiting.ts / 
// document-package.ts): импортируется правилом 8 «у кого мяч»
// (waiting.ts), Пульсом и UI справочника. Чтение БД — в роутах и
// waiting-db.ts.
//
// O-5: дефолтный чек-лист включается «рекомендуется» (isBlocking=false),
// пока владелец не подтвердит блокировки. Блокирующее требование нельзя
// обойти молча: обход — мастер с комментарием (прецедент P1-05).
//
// D31: сторона staff — «документы перевозчика вносит менеджер»;
// подрядчика-получателя в чек-листе нет (кабинет заморожен, из карточки
// DF-14 он убран решением D31).

export type StageDocRequirementInput = {
  stageCode: string
  kind: DocumentKind
  providedBy: DocProvider
  isBlocking: boolean
}

// ── Дефолты D5 (сид миграции df_14 и seed.ts — один состав) ──────────
// Таможенный контур обоих оформлений: декларация на товары и
// разрешительный документ, предоставляет брокер (D35). Перевозочные
// BL/CMR/AWB в дефолты не входят сознательно: вид зависит от типа
// перевозки (мультимодальность), владелец настраивает чек-лист под
// маршрут. Используется UI-подсказкой при первичной настройке; БД —
// источник истины.
export const DEFAULT_STAGE_REQUIREMENT_SEED: ReadonlyArray<{
  stageCode: string
  kind: DocumentKind
  providedBy: DocProvider
}> = [
  { stageCode: 'import_customs', kind: 'customs_declaration', providedBy: 'broker' },
  { stageCode: 'import_customs', kind: 'permit_document', providedBy: 'broker' },
  { stageCode: 'export_customs', kind: 'customs_declaration', providedBy: 'broker' },
  { stageCode: 'export_customs', kind: 'permit_document', providedBy: 'broker' },
]

// DF-26 §4.3.4: вид требования чек-листа — DocumentKind ИЛИ логический
// тип (transport_document — закрывается любым из четырёх вариантов).
export type RequirementKind = DocumentKind | LogicalDocType

/** Подпись вида/логического типа (гард 409, Пульс, правило 8). */
export function requirementKindLabel(kind: RequirementKind): string {
  if (isLogicalDocType(kind)) return LOGICAL_DOC_TYPE_LABELS[kind]
  return DOCUMENT_KIND_LABELS[kind] ?? kind
}

/** Требование вида закрыто финальными документами (логический тип — любым вариантом). */
export function requirementSatisfiedBy(kind: RequirementKind, finalKinds: ReadonlySet<DocumentKind>): boolean {
  if (isLogicalDocType(kind)) {
    return kindsOfLogicalType(kind).some((k) => finalKinds.has(k))
  }
  return finalKinds.has(kind)
}

/**
 * Недостающие блокирующие виды: блокирующие требования, для которых на
 * заявке нет закрывающего финального документа. Порядок — справочник
 * DOCUMENT_KINDS (детерминированный список для 409-текста и правила 8).
 * DF-26 §4.3.4: требование на логический тип «Транспортная накладная»
 * закрывается документом ЛЮБОГО варианта (bill_of_lading/cmr/awb/
 * railway_bill); требование на конкретный вариант — точным совпадением.
 */
export function missingKinds(
  requirements: ReadonlyArray<Pick<StageDocRequirementInput, 'kind' | 'isBlocking'>>,
  finalKinds: readonly DocumentKind[]
): RequirementKind[] {
  const finals = new Set<DocumentKind>(finalKinds)
  const blocking = new Set<RequirementKind>()
  for (const r of requirements) {
    if (r.isBlocking) blocking.add(r.kind as RequirementKind)
  }
  const out: RequirementKind[] = []
  // Сначала конкретные виды (в порядке справочника), затем логические
  // типы — детерминированный список независимо от порядка требований.
  for (const k of DOCUMENT_KINDS) {
    if (blocking.has(k) && !requirementSatisfiedBy(k, finals)) out.push(k)
  }
  for (const k of blocking) {
    if (isLogicalDocType(k) && !requirementSatisfiedBy(k, finals)) out.push(k)
  }
  return out
}

/**
 * Мяч по правилу 8 (DF-05, карточка DF-14): «для ближайшего этапа не
 * хватает обязательного документа → сторона из чек-листа». Возвращает
 * null, если блокирующих недостающих нет.
 */
export function awaitingDocumentOutcome(
  requirements: ReadonlyArray<Pick<StageDocRequirementInput, 'kind' | 'isBlocking' | 'providedBy'>>,
  finalKinds: readonly DocumentKind[]
): { kind: RequirementKind; providedBy: DocProvider } | null {
  const missing = missingKinds(requirements, finalKinds)
  if (missing.length === 0) return null
  const req = requirements.find(
    (r) => r.isBlocking && (r.kind as RequirementKind) === missing[0],
  )
  return req ? { kind: req.kind as RequirementKind, providedBy: req.providedBy } : null
}

// Подписи стороны-получателя требования (UI справочника и слотов —
// те же термины, что у DOCUMENT_KIND_PROVIDERS DF-13).
export const STAGE_DOC_PROVIDER_LABELS: Record<DocProvider, string> = {
  client: 'Клиент',
  broker: 'Брокер',
  staff: 'Сотрудник',
}
