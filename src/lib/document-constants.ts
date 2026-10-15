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

// ── Лимиты загрузки ─────────────────────────────────────────────────
// 4 МБ на файл: вписывается в предел тела запроса serverless-функций
// Vercel (~4,5 МБ) — на большее нужен внешний blob-сторедж, которого
// в MVP нет (осознанное упрощение, см. DEPLOY.md).
export const DOC_FILE_MAX_BYTES = 4 * 1024 * 1024

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

// Человекочитаемый размер для списков (общий для трёх кабинетов).
export function formatDocSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`
}
