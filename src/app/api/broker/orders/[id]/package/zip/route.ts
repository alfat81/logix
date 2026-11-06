// GET — финальные версии (DF-13, обратная совместимость, без событий);
// POST — «все доступные»/«выбранные» (DF-26 §8) с событием document_package_downloaded.
import { NextRequest } from 'next/server'
import { requireBroker } from '@/lib/broker-auth'
import { apiErrorResponse } from '@/lib/api-errors'
import { packageScopeZipResponse, packageZipResponse, ScopeZipSchema } from '@/lib/document-zip-server'
import { parseBody } from '@/lib/document-upload'
import { brokerActor } from '@/lib/activity'

type Params = { params: Promise<{ id: string }> }

// ─── DF-13: «Скачать финальные документы» — кабинет брокера ────────
// Только финальные не-внутренние документы сделки по связи OrderBroker;
// порог размера — JSON-список ссылок; пусто — 400 с внятным текстом.

export async function GET(req: NextRequest, { params }: Params) {
  const auth = await requireBroker(req)
  if (!auth.ok) return auth.response

  const { id } = await params
  try {
    return await packageZipResponse(id, { kind: 'broker', brokerId: auth.broker.id })
  } catch (e) {
    return apiErrorResponse(e, 'broker order package zip GET', 'Не удалось собрать пакет')
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  const auth = await requireBroker(req)
  if (!auth.ok) return auth.response

  const { id } = await params
  try {
    const parsed = await parseBody(req, ScopeZipSchema)
    if (!parsed.ok) return parsed.response
    return await packageScopeZipResponse(
      id,
      { kind: 'broker', brokerId: auth.broker.id },
      brokerActor(auth.broker),
      parsed.data,
    )
  } catch (e) {
    return apiErrorResponse(e, 'broker order package zip POST', 'Не удалось собрать архив')
  }
}
