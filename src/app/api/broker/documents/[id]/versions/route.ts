// no-event: события пишет ядро document-confirm (document_version_added в той же транзакции с переводом версии в ready)
import { NextRequest, NextResponse } from 'next/server'
import { requireBroker } from '@/lib/broker-auth'
import { brokerActor } from '@/lib/activity'
import { apiErrorResponse } from '@/lib/api-errors'
import { documentVisibleToBroker } from '@/lib/documents'
import {
  createPendingVersion,
  DocumentVersionUploadSchema,
  parseBody,
} from '@/lib/document-upload'
import { projectAuthors, projectDocumentAuthors } from '@/lib/actor-name'

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

    const parsed = await parseBody(req, DocumentVersionUploadSchema)
    if (!parsed.ok) return parsed.response
    const result = await createPendingVersion(id, brokerActor(auth.broker), parsed.data)
    if (!result) {
      return NextResponse.json({ error: 'Документ не найден' }, { status: 404 })
    }

    // Событие document_version_added пишет confirm — в той же транзакции,
    // что и перевод версии в ready (DoD 9). DF-02A: автор новой версии —
    // этот пользователь; в ответе сразу имя человека (свой кабинет — коллега).
    const [version] = await projectAuthors([result.version], {
      kind: 'broker',
      brokerId: auth.broker.id,
      companyName: auth.broker.companyName,
    })
    const [document] = await projectDocumentAuthors([result.document], {
      kind: 'broker',
      brokerId: auth.broker.id,
      companyName: auth.broker.companyName,
    })
    return NextResponse.json({ version, document, upload: result.upload, confirmUrl: `/api/broker/document-versions/${result.version.id}/confirm` }, { status: 201 })
  } catch (e) {
    return apiErrorResponse(e, 'broker document versions POST', 'Не удалось загрузить версию')
  }
}
