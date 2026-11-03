// no-event: сборка ZIP финальных версий — чтение, событий не пишет
import { NextRequest } from 'next/server'
import { requireBroker } from '@/lib/broker-auth'
import { apiErrorResponse } from '@/lib/api-errors'
import { packageZipResponse } from '@/lib/document-package-server'

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
