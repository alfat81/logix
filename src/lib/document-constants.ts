// ─── Константы документооборота (Дорожка Е, роадмап 5) ───────────
// Клиент-безопасный модуль (паттерн lib/note-constants.ts и
// lib/search-constants.ts): нужен и роутам (zod-валидация), и формам
// трёх кабинетов (метки типов, подсказки лимитов) — без серверных
// импортов. Структуру «тип документа» сознательно не фиксируем в БД
// дальше строки-кода: список расширяется правкой здесь, значения в
// базе не переписываются (как ACTIVITY_TYPES Ж2).

export const DOCUMENT_TYPES = [
  'accompanying',
  'invoice',
  'permit',
  'customs',
  'contract',
  'application',
  'other',
] as const
export type DocumentType = (typeof DOCUMENT_TYPES)[number]

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  accompanying: 'Товаросопроводительный',
  invoice: 'Инвойс / счёт',
  permit: 'Разрешительный',
  customs: 'Таможенный',
  contract: 'Договор',
  application: 'Заявка',
  other: 'Прочее',
}

// ── DF-12: виды документов (D5) ─────────────────────────────────────
// kind — каноническое поле (Document.kind); легаси type остаётся в БД
// до contract-релиза (DEPRECATIONS): новые записи пишут оба — kind как
// выбран, type — производным (LEGACY_TYPE_FOR_KIND).
export const DOCUMENT_KINDS = [
  'client_request',
  'contractor_request',
  'proforma_invoice',
  'foreign_trade_contract',
  'commercial_invoice',
  'packing_list',
  'permit_document',
  'bill_of_lading',
  'cmr',
  'awb',
  'railway_bill',
  'goods_description',
  'customs_declaration',
  'export_declaration',
  'delivery_confirmation',
  'act_of_services',
  'contractor_agreement',
  'contractor_rates',
  'other',
] as const
export type DocumentKind = (typeof DOCUMENT_KINDS)[number]

export const DOCUMENT_KIND_LABELS: Record<DocumentKind, string> = {
  client_request: 'Заявка клиента',
  contractor_request: 'Заявка подрядчику',
  proforma_invoice: 'Проформа-инвойс',
  foreign_trade_contract: 'Внешнеторговый контракт',
  commercial_invoice: 'Инвойс',
  packing_list: 'Упаковочный лист',
  permit_document: 'Разрешительный документ',
  bill_of_lading: 'Коносамент (BL)',
  cmr: 'CMR (авто)',
  awb: 'AWB (авиа)',
  railway_bill: 'Железнодорожная накладная',
  goods_description: 'Описание товара',
  customs_declaration: 'Декларация на товары',
  export_declaration: 'Экспортная декларация',
  delivery_confirmation: 'Подтверждение доставки',
  act_of_services: 'Акт оказания услуг',
  contractor_agreement: 'Договор с подрядчиком',
  contractor_rates: 'Тарифы подрядчика',
  other: 'Прочее',
}

// DF-26: группировка видов по фазам временной шкалы (реестр, ZIP и
// селект вида — один источник) переехала в document-phases.ts
// (DOCUMENT_KIND_GROUPS, производная от DOCUMENT_PHASES).
// kind — TEXT в БД: 4 новых вида (railway_bill, export_declaration,
// delivery_confirmation, act_of_services) миграции не требуют.

// Виды контура подрядчика (DF-15): всегда внутренние — сервер принуждает
// isInternal=true при загрузке, UI фиксирует видимость на «сотрудникам».
export const INTERNAL_ONLY_KINDS: readonly DocumentKind[] = [
  'contractor_request',
  'contractor_agreement',
  'contractor_rates',
]

// Производный легаси-тип для вида: колонка Document.type NOT NULL и
// читается кодом до contract-релиза, новые записи пишут её из kind.
export const LEGACY_TYPE_FOR_KIND: Record<DocumentKind, DocumentType> = {
  client_request: 'application',
  contractor_request: 'application',
  proforma_invoice: 'invoice',
  foreign_trade_contract: 'contract',
  commercial_invoice: 'invoice',
  packing_list: 'accompanying',
  permit_document: 'permit',
  bill_of_lading: 'accompanying',
  cmr: 'accompanying',
  awb: 'accompanying',
  railway_bill: 'accompanying',
  goods_description: 'accompanying',
  customs_declaration: 'customs',
  export_declaration: 'customs',
  delivery_confirmation: 'accompanying',
  act_of_services: 'other',
  contractor_agreement: 'contract',
  contractor_rates: 'other',
  other: 'other',
}

// Обратный маппинг (легаси type → kind) — совместимость старых клиентов
// API на окне expand: поле type в теле загрузки трактуется как алиас
// вида. contract вне контура подрядчика «чей» — не определить → other;
// ветку isInternal разбирает legacyKindFromType.
export const KIND_FOR_LEGACY_TYPE: Record<DocumentType, DocumentKind> = {
  accompanying: 'other',
  invoice: 'commercial_invoice',
  permit: 'permit_document',
  customs: 'customs_declaration',
  contract: 'other',
  application: 'client_request',
  other: 'other',
}

/** Резолв вида из легаси-алиаса (тело загрузки с type вместо kind). */
export function legacyKindFromType(type: DocumentType, isInternal: boolean): DocumentKind {
  if (type === 'contract') return isInternal ? 'contractor_agreement' : 'other'
  return KIND_FOR_LEGACY_TYPE[type]
}

// ── DF-14: страховка чтения вида ────────────────────────────────────
// kind — источник истины; у гипотетической строки без kind (окно
// backfill) вид резолвится по легаси-типу. Один хелпер на всех
// читателях вида: пакет документов (DF-13), чек-листы этапов и правило
// 8 «у кого мяч» (DF-14) — рассинхрон исключён (IC-14: одна точка).
export function resolveDocumentKind(doc: {
  kind: string | null
  type: string
  isInternal: boolean
}): DocumentKind {
  if (doc.kind) return doc.kind as DocumentKind
  return legacyKindFromType(doc.type as DocumentType, doc.isInternal)
}

// ── DF-12: статусы жизненного цикла документа ───────────────────────
export const DOCUMENT_STATUSES = ['draft', 'in_review', 'final'] as const
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number]

export const DOCUMENT_STATUS_LABELS: Record<DocumentStatus, string> = {
  draft: 'Черновик',
  in_review: 'На проверке',
  final: 'Финальный',
}

// ── DF-13: слоты пакета документов ──────────────────────────────────
// Статус слота вида = худший из статусов документов этого вида («нет» —
// документов вида ещё нет; несколько документов одного вида допустимы —
// мультимодальные BL/CMR, карточка DF-13). Бейджи трёх документных
// статусов — те же DOCUMENT_BADGE_VARIANTS, «Нет» — нейтральный outline.
export const PACKAGE_SLOT_STATUSES = ['none', 'draft', 'in_review', 'final'] as const
export type PackageSlotStatus = (typeof PACKAGE_SLOT_STATUSES)[number]

export const PACKAGE_SLOT_STATUS_LABELS: Record<PackageSlotStatus, string> = {
  none: 'Нет',
  draft: 'Черновик',
  in_review: 'На проверке',
  final: 'Финальный',
}

// Кто по умолчанию предоставляет документ вида — подсказка в слоте
// пакета (D5/D35: клиент приносит проформу, описание товара, контракт
// и инвойсы от продавца; ДТ и разрешительный контур — брокер; BL/CMR/AWB
// и внутренний контур подрядчика — сотрудник: документы перевозчика
// вносит менеджер, карточка DF-14). DF-14 делает состав и владельцев
// слотов настраиваемым (StageDocumentRequirement) — здесь статичные
// дефолты, «Прочее» без фиксированного владельца.
export type DocProvider = 'client' | 'broker' | 'staff'

export const DOC_PROVIDER_LABELS: Record<DocProvider, string> = {
  client: 'Клиент',
  broker: 'Брокер',
  staff: 'Сотрудник',
}

export const DOCUMENT_KIND_PROVIDERS: Record<DocumentKind, DocProvider | null> = {
  client_request: 'client',
  contractor_request: 'staff',
  proforma_invoice: 'client',
  foreign_trade_contract: 'client',
  commercial_invoice: 'client',
  packing_list: 'client',
  permit_document: 'broker',
  bill_of_lading: 'staff',
  cmr: 'staff',
  awb: 'staff',
  railway_bill: 'staff',
  goods_description: 'client',
  customs_declaration: 'broker',
  export_declaration: 'broker',
  delivery_confirmation: 'staff',
  act_of_services: 'staff',
  contractor_agreement: 'staff',
  contractor_rates: 'staff',
  other: null,
}

// ── Лимиты загрузки ─────────────────────────────────────────────────
// DF-11: лимит файла — настройка files.max_mb (по умолчанию 25 МБ,
// валидатор asInt 1..200); байты идут напрямую в хранилище (presigned
// PUT), предел тела serverless-функции больше не ограничивает.
// Константа 4 МБ удалена (G4: замещаемое удаляется в том же релизе).

// Белый список MIME: всё, что реально ходит в логистическом контуре —
// PDF, сканы-картинки, офисные документы, архивы с пакетами бумаг.
// HTML/SVG исключены сознательно (XSS через inline-отдачу), исполняемые
// форматы — тем более.
export const DOC_ALLOWED_MIME = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/zip',
] as const
export type DocAllowedMime = (typeof DOC_ALLOWED_MIME)[number]

// Псевдонимы, которыми браузеры называют те же самые форматы: Firefox
// и «Сжатая ZIP-папка» Windows отдают .zip как application/x-zip-compressed,
// часть Android-браузеров .jpg — как image/jpg. Канонический тип уже в
// белом списке, содержимое на confirm сверяется по сигнатуре, поэтому
// псевдоним безопасно сводится к канону до проверки списка — в БД живут
// только канонические MIME (их resolveFileMime на confirm и ожидает).
export const DOC_MIME_ALIASES: ReadonlyMap<string, DocAllowedMime> = new Map([
  ['application/x-zip-compressed', 'application/zip'],
  ['image/jpg', 'image/jpeg'],
])

// MIME, которые можно отдавать inline (безопасны для рендера браузером
// на своей вкладке): предпросмотр PDF и картинок в одну клику. Остальные
// (office/zip) — только attachment: скачивание, без интерпретации.
export const DOC_INLINE_MIME: readonly string[] = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
]

// Пределы текстовых полей: название документа и комментарий версии.
export const DOC_TITLE_MAX_LENGTH = 200
export const DOC_COMMENT_MAX_LENGTH = 500

// Санитизация имени: без каталогов, без управляющих символов, без
// пустоты и без монструозной длины. Кириллицу сохраняем — браузеры
// корректно отдают её в Content-Disposition.
export function sanitizeFileName(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? ''
  const cleaned = base.replace(/[\u0000-\u001f<>:"|?*]/g, '').trim()
  if (!cleaned) return 'file'
  return cleaned.length > 120 ? cleaned.slice(-120) : cleaned
}

// Человекочитаемый размер для списков (общий для трёх кабинетов).
export function formatDocSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`
}
