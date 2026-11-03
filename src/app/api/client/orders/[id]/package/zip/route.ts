// no-event: сборка ZIP финальных версий — чтение, событий не пишет
import { NextRequest } from 'next/server'
import { requireClient } from '@/lib/client-auth'
import { apiErrorResponse } from '@/lib/api-errors'
import { packageZipResponse } from '@/lib/document-package-server'

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
