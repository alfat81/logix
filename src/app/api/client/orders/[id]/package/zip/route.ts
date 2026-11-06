// GET — финальные версии (DF-13, обратная совместимость, без событий);
// POST — «все доступные»/«выбранные» (DF-26 §8) с событием document_package_downloaded.
import { NextRequest } from 'next/server'
import { requireClient } from '@/lib/client-auth'
import { apiErrorResponse } from '@/lib/api-errors'
import { packageScopeZipResponse, packageZipResponse, ScopeZipSchema } from '@/lib/document-zip-server'
import { parseBody } from '@/lib/document-upload'
import { clientActor } from '@/lib/activity'

type Params = { params: Promise<{ id: string }> }

// ─── DF-13: «Скачать финальные документы» — кабинет клиента ────────
// Только финальные не-внутренние документы своей заявки;
// порог размера — JSON-список ссылок; пусто — 400 с внятным текстом.

export async function GET(req: NextRequest, { params }: Params) {
  const auth = await requireClient(req)
  if (!auth.ok) return auth.response

  const { id } = await params
  try {
    return await packageZipResponse(id, { kind: 'client', customerId: auth.client.id })
  } catch (e) {
    return apiErrorResponse(e, 'client order package zip GET', 'Не удалось собрать пакет')
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  const auth = await requireClient(req)
  if (!auth.ok) return auth.response

  const { id } = await params
  try {
    const parsed = await parseBody(req, ScopeZipSchema)
    if (!parsed.ok) return parsed.response
    return await packageScopeZipResponse(
      id,
      { kind: 'client', customerId: auth.client.id },
      clientActor(auth.client),
      parsed.data,
    )
  } catch (e) {
    return apiErrorResponse(e, 'client order package zip POST', 'Не удалось собрать архив')
  }
}
