import { NextRequest, NextResponse } from 'next/server'
import { requireBroker } from '@/lib/broker-auth'
import { brokerActor } from '@/lib/activity'
import { apiErrorResponse } from '@/lib/api-errors'
import {
  addDocumentVersion,
  documentVisibleToBroker,
  logDocumentVersionAdded,
  parseDocumentVersionForm,
  type DocumentDealTarget,
} from '@/lib/documents'

type Params = { params: Promise<{ id: string }> }

// ─── Новая версия документа — кабинет брокера (Е) ─────────────────
// Роадмап 5: «правки от брокера» — комментарий «что изменено и почему»
// обязателен культурно, технически опционален (как у клиента: файл
// может говорить сам за себя). Только документы связанных сделок,
// не внутренние.
export async function POST(req: NextRequest, { params }: Params) {
  const auth = await requireBroker(req)
  if (!auth.ok) return auth.response

  const { id } = await params
  try {
    const doc = await documentVisibleToBroker(id, auth.broker.id)
    if (!doc) {
      return NextResponse.json({ error: 'Документ не найден' }, { status: 404 })
    }

    const parsed = await parseDocumentVersionForm(req)
    if (!parsed.ok) return parsed.response

    const result = await addDocumentVersion(
      id,
      brokerActor(auth.broker),
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
      brokerActor(auth.broker),
      doc.title,
      result.version.version,
      parsed.comment,
      // DF-01: documentId связывает событие с документом (лента → файл)
      { documentId: id }
    )

    return NextResponse.json({ version: result.version, document: result.document }, { status: 201 })
  } catch (e) {
    return apiErrorResponse(e, 'broker document versions POST', 'Не удалось загрузить версию')
  }
}
