// no-event: события пишет ядро permits-db (permit_added/permit_received/permit_waived/permit_overdue через emitEvent) — роут только авторизует и валидирует
import { NextRequest, NextResponse } from 'next/server'
import { requireEmployee } from '@/lib/auth'
import { apiErrorResponse } from '@/lib/api-errors'
import { employeeActor } from '@/lib/activity'
import { parseDocumentCreateForm } from '@/lib/documents'
import { closePermitWithDocument } from '@/lib/permits-db'
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

    const parsed = await parseDocumentCreateForm(req)
    if (!parsed.ok) return parsed.response

    const result = await closePermitWithDocument(
      id,
      employeeActor(auth.employee),
      { title: parsed.meta.title || permit.title, comment: parsed.meta.comment },
      parsed.file
    )
    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json({ permit: result.permit, documentId: result.documentId }, { status: 201 })
  } catch (e) {
    return apiErrorResponse(e, 'admin permit document POST', 'Не удалось закрыть строку документом')
  }
}
