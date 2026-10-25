import {
  DOCUMENT_TYPE_LABELS,
  formatDocSize,
  type DocumentType,
} from '@/lib/document-constants'

// v0.5.0 (P1-22): типы и хелперы секции документов (Дорожка Е) —
// выезд из DocumentsSection.tsx (резка под лимит 300, RULES 2.14).
// Списочные проекции без fileData: байты в БД, скачивание — только
// через авторизующий роут /api/document-versions/[id]/file.

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
