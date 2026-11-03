// no-event: слоты пакета — проекция чтения DF-13, событий не пишет
import { NextRequest } from 'next/server'
import { requireEmployee } from '@/lib/auth'
import { apiErrorResponse } from '@/lib/api-errors'
import { getSetting } from '@/lib/settings'
import { packageSlotsResponse } from '@/lib/document-package-server'
import { STAFF_READER } from '@/lib/actor-name'

type Params = { params: Promise<{ id: string }> }

// ─── DF-13: пакет документов заявки — кабинет менеджера ────────────
// GET — слоты по видам (D5) со статусами «нет/черновик/на проверке/
// финальный»: все виды, включая внутренний контур подрядчика.
// ZIP финальных — GET …/package/zip. Владение и видимость — в
// packageSlotsResponse (staff видит любую заявку).

export async function GET(req: NextRequest, { params }: Params) {
  const auth = await requireEmployee(req)
  if (!auth.ok) return auth.response

  const { id } = await params
  try {
    return await packageSlotsResponse(id, STAFF_READER, await getSetting('files.max_mb'))
  } catch (e) {
    return apiErrorResponse(e, 'order package GET', 'Не удалось загрузить пакет документов')
  }
}
