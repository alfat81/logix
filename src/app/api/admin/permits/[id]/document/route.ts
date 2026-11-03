// no-event: события пишет ядро permits-db (permit_added/permit_received/permit_waived/permit_overdue через emitEvent) — роут только авторизует и валидирует
import { NextRequest, NextResponse } from 'next/server'
import { requireEmployee } from '@/lib/auth'
import { apiErrorResponse } from '@/lib/api-errors'
import { employeeActor } from '@/lib/activity'
import {
  createPendingDocument,
  PermitDocumentUploadSchema,
  parseBody,
} from '@/lib/document-upload'
import { permitTargetOf } from '@/lib/permits-db'
import { permitForStaff } from '@/lib/permits-access'

type Params = { params: Promise<{ id: string }> }

// ─── POST /api/admin/permits/[id]/document — закрыть строку документом (DF-16) ──
// Сотрудник закрывает обязательство загрузкой файла прямо в строке:
// создаётся документ type='permit' (контур Е), строка → received.

export async function POST(req: NextRequest, { params }: Params) {
  const auth = await requireEmployee(req, { write: true })
  if (!auth.ok) return auth.response

  const { id } = await params
  try {
    const permit = await permitForStaff(id)
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
    const result = await createPendingDocument(permitTargetOf(permit), employeeActor(auth.employee), {
      kind: 'permit_document',
      title: parsed.data.title?.trim() || permit.title,
      isInternal: false,
      comment: parsed.data.comment,
      fileName: parsed.data.fileName,
      mimeType: parsed.data.mimeType,
      size: parsed.data.size,
    })
    return NextResponse.json({ ...result, permitRequirementId: permit.id, confirmUrl: `/api/admin/document-versions/${result.version.id}/confirm` }, { status: 201 })
  } catch (e) {
    return apiErrorResponse(e, 'admin permit document POST', 'Не удалось закрыть строку документом')
  }
}
