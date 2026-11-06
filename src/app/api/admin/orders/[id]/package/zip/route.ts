// GET — финальные версии (DF-13, обратная совместимость, без событий);
// POST — «все доступные»/«выбранные» (DF-26 §8) с событием document_package_downloaded.
import { NextRequest } from 'next/server'
import { requireEmployee } from '@/lib/auth'
import { apiErrorResponse } from '@/lib/api-errors'
import { packageScopeZipResponse, packageZipResponse, ScopeZipSchema } from '@/lib/document-zip-server'
import { parseBody } from '@/lib/document-upload'
import { employeeActor } from '@/lib/activity'
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

export async function POST(req: NextRequest, { params }: Params) {
  // POST пишет событие document_package_downloaded — мутация, гард write (DF-00).
  const auth = await requireEmployee(req, { write: true })
  if (!auth.ok) return auth.response

  const { id } = await params
  try {
    const parsed = await parseBody(req, ScopeZipSchema)
    if (!parsed.ok) return parsed.response
    return await packageScopeZipResponse(
      id,
      { kind: 'staff' },
      employeeActor(auth.employee),
      parsed.data,
    )
  } catch (e) {
    return apiErrorResponse(e, 'order package zip POST', 'Не удалось собрать архив')
  }
}
