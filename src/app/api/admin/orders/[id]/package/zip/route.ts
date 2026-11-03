// no-event: сборка ZIP финальных версий — чтение, событий не пишет
import { NextRequest } from 'next/server'
import { requireEmployee } from '@/lib/auth'
import { apiErrorResponse } from '@/lib/api-errors'
import { packageZipResponse } from '@/lib/document-package-server'
import { STAFF_READER } from '@/lib/actor-name'

type Params = { params: Promise<{ id: string }> }

// ─── DF-13: «Скачать финальные документы» — кабинет менеджера ──────
// ZIP из финальных документов (все, включая внутренний контур);
// порог размера — JSON-список ссылок на отдельные версии;
// пустой финальный пакет — 400 с внятным текстом.

export async function GET(req: NextRequest, { params }: Params) {
  const auth = await requireEmployee(req)
  if (!auth.ok) return auth.response

  const { id } = await params
  try {
    return await packageZipResponse(id, STAFF_READER)
  } catch (e) {
    return apiErrorResponse(e, 'order package zip GET', 'Не удалось собрать пакет')
  }
}
