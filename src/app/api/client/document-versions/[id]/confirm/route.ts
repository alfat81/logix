// no-event: события пишет ядро document-confirm (document_created/document_version_added + permit_received в транзакции confirm)
import { NextRequest, NextResponse } from 'next/server'
import { requireClient } from '@/lib/client-auth'
import { clientActor } from '@/lib/activity'
import { apiErrorResponse } from '@/lib/api-errors'
import { documentVisibleToClient } from '@/lib/documents'
import {
  confirmDocumentVersion,
  loadVersionForConfirm,
} from '@/lib/document-confirm'
import { readJsonBody } from '@/lib/document-upload'
import { permitForClient } from '@/lib/permits-access'
import { projectAuthors, projectDocumentAuthors } from '@/lib/actor-name'
import { parseConfirmPermitOpts } from '@/lib/document-confirm'

type Params = { params: Promise<{ id: string }> }

// ─── Шаг 3 загрузки (DF-11) — кабинет клиента ──────────────────────
// Права ДО любого обращения к хранилищу: чужая версия — единый 404,
// факт существования не раскрываем (паттерн И1, карточка DF-11).
// permitRequirementId — клиент закрыл строку разрешительных (DF-16).
export async function POST(req: NextRequest, { params }: Params) {
  const auth = await requireClient(req)
  if (!auth.ok) return auth.response

  const { id } = await params
  try {
    const body = await readJsonBody(req)
    // DF-26 волна 2 (§6.4 п. 1): один документ — несколько требований
    // (парсер общий — permit-checks-http не нужен, document-confirm).
    const opts = parseConfirmPermitOpts(body)
    const permitIds = [
      ...(opts.permitRequirementId ? [opts.permitRequirementId] : []),
      ...(opts.permitRequirementIds ?? []),
    ]
    for (const permitId of permitIds) {
      const permit = await permitForClient(permitId, auth.client.id)
      if (!permit) return NextResponse.json({ error: 'Строка не найдена' }, { status: 404 })
    }

    const pending = await loadVersionForConfirm(id)
    if (!pending) {
      return NextResponse.json({ error: 'Версия не найдена' }, { status: 404 })
    }
    const visible = await documentVisibleToClient(pending.documentId, auth.client.id)
    if (!visible) {
      return NextResponse.json({ error: 'Версия не найдена' }, { status: 404 })
    }

    const outcome = await confirmDocumentVersion(pending, clientActor(auth.client), opts)
    if (!outcome.ok) {
      return NextResponse.json({ error: outcome.error }, { status: outcome.status })
    }
    // DF-02A: автор версии — этот пользователь; в ответе имя человека.
    const [version] = await projectAuthors([outcome.version], {
      kind: 'client',
      customerId: auth.client.id,
      companyName: auth.client.name,
    })
    const [document] = await projectDocumentAuthors([outcome.document], {
      kind: 'client',
      customerId: auth.client.id,
      companyName: auth.client.name,
    })
    return NextResponse.json(
      { version, document, permitId: outcome.permitIds[0], permitIds: outcome.permitIds },
      { status: 200 },
    )
  } catch (e) {
    return apiErrorResponse(e, 'document confirm POST (client)', 'Не удалось подтвердить загрузку')
  }
}
