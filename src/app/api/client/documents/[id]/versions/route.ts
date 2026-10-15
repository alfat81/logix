import { NextRequest, NextResponse } from 'next/server'
import { requireClient } from '@/lib/client-auth'
import { clientActor } from '@/lib/activity'
import { apiErrorResponse } from '@/lib/api-errors'
import {
  addDocumentVersion,
  documentVisibleToClient,
  logDocumentVersionAdded,
  parseDocumentVersionForm,
  type DocumentDealTarget,
} from '@/lib/documents'

type Params = { params: Promise<{ id: string }> }

// ─── Новая версия документа — кабинет клиента (Е) ─────────────────
// Роадмап 5: «проект документа правится несколько раз до финальной
// версии» — клиент правит свой проект (или уточняет по замечанию
// брокера). Только видимые ему документы (свои сделки, не внутренние).
export async function POST(req: NextRequest, { params }: Params) {
  const auth = await requireClient(req)
  if (!auth.ok) return auth.response

  const { id } = await params
  try {
    const doc = await documentVisibleToClient(id, auth.client.id)
    if (!doc) {
      return NextResponse.json({ error: 'Документ не найден' }, { status: 404 })
    }

    const parsed = await parseDocumentVersionForm(req)
    if (!parsed.ok) return parsed.response

    const result = await addDocumentVersion(
      id,
      clientActor(auth.client),
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
      clientActor(auth.client),
      doc.title,
      result.version.version,
      parsed.comment
    )

    return NextResponse.json({ version: result.version, document: result.document }, { status: 201 })
  } catch (e) {
    return apiErrorResponse(e, 'client document versions POST', 'Не удалось загрузить версию')
  }
}
