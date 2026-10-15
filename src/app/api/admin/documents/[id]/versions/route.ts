import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireEmployee } from '@/lib/auth'
import { employeeActor } from '@/lib/activity'
import { apiErrorResponse } from '@/lib/api-errors'
import {
  addDocumentVersion,
  logDocumentVersionAdded,
  parseDocumentVersionForm,
  type DocumentDealTarget,
} from '@/lib/documents'

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

    const parsed = await parseDocumentVersionForm(req)
    if (!parsed.ok) return parsed.response

    const result = await addDocumentVersion(
      id,
      employeeActor(auth.employee),
      parsed.file,
      parsed.comment
    )
    if (!result) {
      return NextResponse.json({ error: 'Документ не найден' }, { status: 404 })
    }

    const deal: DocumentDealTarget = doc.orderId
      ? { orderId: doc.orderId }
      : { leadId: doc.leadId! }
    await logDocumentVersionAdded(
      deal,
      employeeActor(auth.employee),
      doc.title,
      result.version.version,
      parsed.comment,
      { isInternal: doc.isInternal }
    )

    return NextResponse.json({ version: result.version, document: result.document }, { status: 201 })
  } catch (e) {
    return apiErrorResponse(e, 'document versions POST', 'Не удалось загрузить версию')
  }
}
