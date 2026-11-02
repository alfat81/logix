// no-event: события пишет ядро document-confirm (document_created/document_version_added + permit_received в транзакции confirm)
import { NextRequest, NextResponse } from 'next/server'
import { requireBroker } from '@/lib/broker-auth'
import { brokerActor } from '@/lib/activity'
import { apiErrorResponse } from '@/lib/api-errors'
import { documentVisibleToBroker } from '@/lib/documents'
import {
  confirmDocumentVersion,
  loadVersionForConfirm,
} from '@/lib/document-confirm'
import { readJsonBody } from '@/lib/document-upload'
import { permitForBroker } from '@/lib/permits-access'
import { projectAuthors, projectDocumentAuthors } from '@/lib/actor-name'

type Params = { params: Promise<{ id: string }> }

// ─── Шаг 3 загрузки (DF-11) — кабинет брокера ──────────────────────
// Права ДО любого обращения к хранилищу: чужая версия — единый 404
// (паттерн И1, карточка DF-11). permitRequirementId — брокер закрыл
// строку разрешительных (DF-16).
export async function POST(req: NextRequest, { params }: Params) {
  const auth = await requireBroker(req)
  if (!auth.ok) return auth.response

  const { id } = await params
  try {
    const body = await readJsonBody(req)
    const opts =
      body && typeof body === 'object' && 'permitRequirementId' in body
        ? { permitRequirementId: String((body as { permitRequirementId: unknown }).permitRequirementId) }
        : {}
    const permitId = opts.permitRequirementId
    if (permitId) {
      const permit = await permitForBroker(permitId, auth.broker.id)
      if (!permit) return NextResponse.json({ error: 'Строка не найдена' }, { status: 404 })
    }

    const pending = await loadVersionForConfirm(id)
    if (!pending) {
      return NextResponse.json({ error: 'Версия не найдена' }, { status: 404 })
    }
    const visible = await documentVisibleToBroker(pending.documentId, auth.broker.id)
    if (!visible) {
      return NextResponse.json({ error: 'Версия не найдена' }, { status: 404 })
    }

    const outcome = await confirmDocumentVersion(pending, brokerActor(auth.broker), opts)
    if (!outcome.ok) {
      return NextResponse.json({ error: outcome.error }, { status: outcome.status })
    }
    // DF-02A: автор версии — этот пользователь; в ответе имя человека.
    const [version] = await projectAuthors([outcome.version], {
      kind: 'broker',
      brokerId: auth.broker.id,
    })
    const [document] = await projectDocumentAuthors([outcome.document], {
      kind: 'broker',
      brokerId: auth.broker.id,
    })
    return NextResponse.json({ version, document, permitId: outcome.permitId }, { status: 200 })
  } catch (e) {
    return apiErrorResponse(e, 'document confirm POST (broker)', 'Не удалось подтвердить загрузку')
  }
}
