// no-event: событие пишет ядро document-lifecycle (document_finalized в транзакции с переводом статуса)
import { NextRequest, NextResponse } from 'next/server'
import { requireEmployee } from '@/lib/auth'
import { employeeActor } from '@/lib/activity'
import { apiErrorResponse } from '@/lib/api-errors'
import { LifecycleError, finalizeDocument } from '@/lib/document-lifecycle'

type Params = { params: Promise<{ id: string }> }

// ─── POST /api/admin/documents/[id]/finalize — «Финальный» (DF-12) ──
// Только сотрудник (клиент/брокер получают 401 на админ-роут). Финальная
// версия — текущая на момент нажатия; тело не требуется.
export async function POST(req: NextRequest, { params }: Params) {
  const auth = await requireEmployee(req, { write: true })
  if (!auth.ok) return auth.response

  const { id } = await params
  try {
    const document = await finalizeDocument(id, employeeActor(auth.employee))
    if (!document) {
      return NextResponse.json({ error: 'Документ не найден' }, { status: 404 })
    }
    return NextResponse.json({ document })
  } catch (e) {
    if (e instanceof LifecycleError) {
      return NextResponse.json({ error: e.message }, { status: e.status })
    }
    return apiErrorResponse(e, 'document finalize', 'Не удалось финализировать документ')
  }
}
