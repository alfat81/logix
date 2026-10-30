// no-event: события пишет ядро permits-db (permit_added/permit_received/permit_waived/permit_overdue через emitEvent) — роут только авторизует и валидирует
import { NextRequest, NextResponse } from 'next/server'
import { requireClient } from '@/lib/client-auth'
import { apiErrorResponse } from '@/lib/api-errors'
import { clientActor } from '@/lib/activity'
import { parseDocumentCreateForm } from '@/lib/documents'
import { closePermitWithDocument } from '@/lib/permits-db'
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

    const parsed = await parseDocumentCreateForm(req)
    if (!parsed.ok) return parsed.response

    const result = await closePermitWithDocument(
      id,
      clientActor(auth.client),
      { title: parsed.meta.title || permit.title, comment: parsed.meta.comment },
      parsed.file
    )
    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json({ permit: result.permit, documentId: result.documentId }, { status: 201 })
  } catch (e) {
    return apiErrorResponse(e, 'client permit document POST', 'Не удалось загрузить документ')
  }
}
