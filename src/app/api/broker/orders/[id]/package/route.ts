// no-event: слоты пакета — проекция чтения DF-13, событий не пишет
import { NextRequest } from 'next/server'
import { requireBroker } from '@/lib/broker-auth'
import { apiErrorResponse } from '@/lib/api-errors'
import { getSetting } from '@/lib/settings'
import { packageSlotsResponse } from '@/lib/document-package-server'

type Params = { params: Promise<{ id: string }> }

// ─── DF-13: пакет документов заявки — кабинет брокера ──────────────
// Видимость заявки целиком (5а) через OrderBroker (404 на чужие);
// внутренние документы и подрядческие виды в слотах не раскрываются.

export async function GET(req: NextRequest, { params }: Params) {
  const auth = await requireBroker(req)
  if (!auth.ok) return auth.response

  const { id } = await params
  try {
    return await packageSlotsResponse(
      id,
      { kind: 'broker', brokerId: auth.broker.id },
      await getSetting('files.max_mb'),
    )
  } catch (e) {
    return apiErrorResponse(e, 'broker order package GET', 'Не удалось загрузить пакет документов')
  }
}
