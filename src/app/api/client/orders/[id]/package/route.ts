// no-event: слоты пакета — проекция чтения DF-13, событий не пишет
import { NextRequest } from 'next/server'
import { requireClient } from '@/lib/client-auth'
import { apiErrorResponse } from '@/lib/api-errors'
import { getSetting } from '@/lib/settings'
import { packageSlotsResponse } from '@/lib/document-package-server'

type Params = { params: Promise<{ id: string }> }

// ─── DF-13: пакет документов заявки — кабинет клиента ──────────────
// Свои заявки (404 на чужие); внутренние документы и подрядческие виды
// в слотах не раскрываются (DF-15) — 12 видов по фазам сделки.

export async function GET(req: NextRequest, { params }: Params) {
  const auth = await requireClient(req)
  if (!auth.ok) return auth.response

  const { id } = await params
  try {
    return await packageSlotsResponse(
      id,
      { kind: 'client', customerId: auth.client.id },
      await getSetting('files.max_mb'),
    )
  } catch (e) {
    return apiErrorResponse(e, 'client order package GET', 'Не удалось загрузить пакет документов')
  }
}
