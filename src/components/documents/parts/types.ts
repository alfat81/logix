import {
  DOCUMENT_KIND_LABELS,
  DOCUMENT_STATUS_LABELS,
  DOCUMENT_TYPE_LABELS,
  PACKAGE_SLOT_STATUS_LABELS,
  formatDocSize,
  type DocumentKind,
  type DocumentStatus,
  type DocumentType,
  type PackageSlotStatus,
} from '@/lib/document-constants'

// v0.5.0 (P1-22): типы и хелперы секции документов (Дорожка Е) —
// выезд из DocumentsSection.tsx (резка под лимит 300, RULES 2.14).
// Списочные проекции без fileData: байты в БД/хранилище, скачивание —
// только через авторизующий роут /api/document-versions/[id]/file.

export type DocVersionRowUi = {
  id: string
  version: number
  fileName: string
  mimeType: string
  fileSize: number
  comment: string | null
  authorType: 'employee' | 'client' | 'broker' | string
  authorName: string
  createdAt: string
}

export type DocRowUi = {
  id: string
  type: DocumentType | string
  // DF-12: вид (D5) и жизненный цикл; kind после backfill заполнен
  // всегда — fallback на легаси type оставлен страховкой чтения.
  kind: DocumentKind | string | null
  status: DocumentStatus | string
  finalizedAt: string | null
  finalizedByName: string | null
  finalVersion: number | null
  title: string
  isInternal: boolean
  currentVersion: number
  createdAt: string
  updatedAt: string
  versions: DocVersionRowUi[]
}

export const AUTHOR_ROLE_LABELS: Record<string, string> = {
  employee: 'менеджер',
  client: 'клиент',
  broker: 'брокер',
}

export function typeLabel(t: string): string {
  return DOCUMENT_TYPE_LABELS[t as DocumentType] ?? t
}

/** Подпись вида: kind — источник истины, легаси type — fallback. */
export function kindLabel(doc: { kind: string | null; type: string }): string {
  if (doc.kind) return DOCUMENT_KIND_LABELS[doc.kind as DocumentKind] ?? doc.kind
  return typeLabel(doc.type)
}

export function statusLabel(s: string): string {
  return DOCUMENT_STATUS_LABELS[s as DocumentStatus] ?? s
}

/** Подпись статуса слота пакета (DF-13): «Нет» / статусы документа. */
export function slotStatusLabel(s: string): string {
  return PACKAGE_SLOT_STATUS_LABELS[s as PackageSlotStatus] ?? s
}

/** DF-13: слот пакета — строка вида документа с его документами. */
export type PackageSlotUi = {
  kind: DocumentKind | string
  status: PackageSlotStatus | string
  provider: 'client' | 'broker' | 'staff' | null
  documents: DocRowUi[]
}

export function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export const fileLabel = (f: File | null): string =>
  f ? `${f.name} · ${formatDocSize(f.size)}` : 'Файл не выбран'
