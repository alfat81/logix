// no-event: событие пишет ядро document-lifecycle (document_reopened в транзакции с переводом статуса)
import { NextRequest, NextResponse } from 'next/server'
import { requireEmployee } from '@/lib/auth'
import { employeeActor } from '@/lib/activity'
import { apiErrorResponse } from '@/lib/api-errors'
import {
  DocumentReopenSchema,
  LifecycleError,
  reopenDocument,
} from '@/lib/document-lifecycle'
import { parseBody } from '@/lib/document-upload'

type Params = { params: Promise<{ id: string }> }

// ─── POST /api/admin/documents/[id]/reopen — «Вернуть в работу» (DF-12)
// Единственный путь добавить версию к финальному документу: причина
// обязательна (400 без неё), уходит в журнал сделки (document_reopened).
export async function POST(req: NextRequest, { params }: Params) {
  const auth = await requireEmployee(req, { write: true })
  if (!auth.ok) return auth.response

  const { id } = await params
  try {
    const parsed = await parseBody(req, DocumentReopenSchema)
    if (!parsed.ok) return parsed.response
    const document = await reopenDocument(id, employeeActor(auth.employee), parsed.data)
    if (!document) {
      return NextResponse.json({ error: 'Документ не найден' }, { status: 404 })
    }
    return NextResponse.json({ document })
  } catch (e) {
    if (e instanceof LifecycleError) {
      return NextResponse.json({ error: e.message }, { status: e.status })
    }
    return apiErrorResponse(e, 'document reopen', 'Не удалось вернуть документ в работу')
  }
}
