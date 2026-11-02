// no-event: события пишет ядро document-confirm (document_version_added в той же транзакции с переводом версии в ready)
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireEmployee } from '@/lib/auth'
import { employeeActor } from '@/lib/activity'
import { apiErrorResponse } from '@/lib/api-errors'
import {
  createPendingVersion,
  DocumentVersionUploadSchema,
  parseBody,
} from '@/lib/document-upload'

type Params = { params: Promise<{ id: string }> }

// ─── Новая версия документа (Е) — кабинет менеджера ───────────────
// multipart: comment («что изменено и почему»), file. Версия ниже
// 2+ создаётся только здесь и в порталах клиента/брокера — отдельного
// PATCH у версии нет: файл неизменен по построению, менять нечего.
export async function POST(req: NextRequest, { params }: Params) {
  const auth = await requireEmployee(req, { write: true })
  if (!auth.ok) return auth.response

  const { id } = await params
  try {
    const doc = await db.document.findUnique({
      where: { id },
      select: { id: true, title: true, isInternal: true, leadId: true, orderId: true },
    })
    if (!doc) {
      return NextResponse.json({ error: 'Документ не найден' }, { status: 404 })
    }

    const parsed = await parseBody(req, DocumentVersionUploadSchema)
    if (!parsed.ok) return parsed.response
    const result = await createPendingVersion(id, employeeActor(auth.employee), parsed.data)
    if (!result) {
      return NextResponse.json({ error: 'Документ не найден' }, { status: 404 })
    }

    // Событие document_version_added пишет confirm — в той же транзакции,
    // что и перевод версии в ready (DoD 9).
    return NextResponse.json({ ...result, confirmUrl: `/api/admin/document-versions/${result.version.id}/confirm` }, { status: 201 })
  } catch (e) {
    return apiErrorResponse(e, 'document versions POST', 'Не удалось загрузить версию')
  }
}
