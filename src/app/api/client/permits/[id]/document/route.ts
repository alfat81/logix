// no-event: события пишет ядро permits-db (permit_added/permit_received/permit_waived/permit_overdue через emitEvent) — роут только авторизует и валидирует
import { NextRequest, NextResponse } from 'next/server'
import { requireClient } from '@/lib/client-auth'
import { apiErrorResponse } from '@/lib/api-errors'
import { clientActor } from '@/lib/activity'
import {
  createPendingDocument,
  PermitDocumentUploadSchema,
  parseBody,
} from '@/lib/document-upload'
import { permitTargetOf } from '@/lib/permits-db'
import { permitForClient } from '@/lib/permits-access'

type Params = { params: Promise<{ id: string }> }

// ─── POST /api/client/permits/[id]/document — клиент закрыл строку (DF-16) ──
// Карточка DF-16: «кто закрывает: клиент, брокер или сотрудник —
// загрузкой документа прямо в строке». Свои сделки (чужая строка — 404).

export async function POST(req: NextRequest, { params }: Params) {
  const auth = await requireClient(req)
  if (!auth.ok) return auth.response

  const { id } = await params
  try {
    const permit = await permitForClient(id, auth.client.id)
    if (!permit) return NextResponse.json({ error: 'Строка не найдена' }, { status: 404 })

    if (permit.status !== 'pending') {
      return NextResponse.json(
        { error: 'Строка уже закрыта — документ прикладывается версиями к загруженному' },
        { status: 409 }
      )
    }

    const parsed = await parseBody(req, PermitDocumentUploadSchema)
    if (!parsed.ok) return parsed.response

    // DF-11 × DF-16: строку закрывает confirm подтверждённого документа
    // (permitRequirementId в теле confirm), здесь — шаг 1: pending-документ
    // вида permit и presigned PUT.
    const result = await createPendingDocument(permitTargetOf(permit), clientActor(auth.client), {
      kind: 'permit_document',
      title: parsed.data.title?.trim() || permit.title,
      isInternal: false,
      comment: parsed.data.comment,
      fileName: parsed.data.fileName,
      mimeType: parsed.data.mimeType,
      size: parsed.data.size,
    })
    return NextResponse.json({ ...result, permitRequirementId: permit.id, confirmUrl: `/api/client/document-versions/${result.version.id}/confirm` }, { status: 201 })
  } catch (e) {
    return apiErrorResponse(e, 'client permit document POST', 'Не удалось загрузить документ')
  }
}
