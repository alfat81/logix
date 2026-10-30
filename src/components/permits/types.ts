// Типы UI разрешительных документов (DF-16). Чистый модуль без
// серверных зависимостей — как components/documents/parts/types.ts.
// Строка приходит из GET карточки (permitRequirements) или GET списка
// /permits; поле staffNote есть ТОЛЬКО в staff-проекции (наружу
// PERMIT_EXTERNAL_FIELDS его не отдаёт) — тип толерантный.

import type { PermitProvider, PermitStatus } from '@/lib/permits'

export type PermitRowUi = {
  id: string
  title: string
  providedBy: PermitProvider
  isBlocking: boolean
  // Дата ГГГГ-ММ-ДД (UTC-полночь из формы) или null — без срока
  neededBy: string | null
  status: PermitStatus
  documentId: string | null
  receivedAt: string | null
  receivedByName: string | null
  waivedReason: string | null
  // Привязка к строке ответа брокера (DF-18) — только в полной проекции
  itemId?: string | null
  // Внутренняя заметка строки — только сотрудникам (сервер режет)
  staffNote?: string | null
  createdAt: string
}

export type PermitViewer = 'staff' | 'client' | 'broker'
