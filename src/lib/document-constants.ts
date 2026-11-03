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
  'goods_description',
  'customs_declaration',
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
  goods_description: 'Описание товара',
  customs_declaration: 'Декларация на товары',
  contractor_agreement: 'Договор с подрядчиком',
  contractor_rates: 'Тарифы подрядчика',
  other: 'Прочее',
}

// Группировка видов по фазам клиента (карточка DF-12): расчёт →
// оформление и перевозка; служебные виды (заявки, договоры контура
// подрядчика) и «Прочее» — в конце. Порядок используется в форме
// загрузки; фазовые группы — в пакете документов (DF-13). Группы
// покрывают список ПОЛНОСТЬЮ и без пересечений (unit-тест).
export const DOCUMENT_KIND_GROUPS: ReadonlyArray<{
  code: 'calculation' | 'execution' | 'deals' | 'misc'
  label: string
  kinds: readonly DocumentKind[]
}> = [
  {
    code: 'calculation',
    label: 'Расчёт',
    kinds: ['proforma_invoice', 'goods_description'],
  },
  {
    code: 'execution',
    label: 'Оформление и перевозка',
    kinds: [
      'foreign_trade_contract',
      'commercial_invoice',
      'packing_list',
      'bill_of_lading',
      'cmr',
      'awb',
      'customs_declaration',
      'permit_document',
    ],
  },
  {
    code: 'deals',
    label: 'Заявки и договоры',
    kinds: ['client_request', 'contractor_request', 'contractor_agreement', 'contractor_rates'],
  },
  { code: 'misc', label: 'Прочее', kinds: ['other'] },
]

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
  goods_description: 'accompanying',
  customs_declaration: 'customs',
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

// ── DF-12: статусы жизненного цикла документа ───────────────────────
export const DOCUMENT_STATUSES = ['draft', 'in_review', 'final'] as const
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number]

export const DOCUMENT_STATUS_LABELS: Record<DocumentStatus, string> = {
  draft: 'Черновик',
  in_review: 'На проверке',
  final: 'Финальный',
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
