// no-event: события пишет ядро permits-db (permit_added/permit_received/permit_waived/permit_overdue через emitEvent) — роут только авторизует и валидирует
import { NextRequest, NextResponse } from 'next/server'
import { requireBroker } from '@/lib/broker-auth'
import { apiErrorResponse } from '@/lib/api-errors'
import { brokerActor } from '@/lib/activity'
import { parseDocumentCreateForm } from '@/lib/documents'
import { closePermitWithDocument } from '@/lib/permits-db'
import { permitForBroker } from '@/lib/permits-access'

type Params = { params: Promise<{ id: string }> }

// ─── POST /api/broker/permits/[id]/document — брокер закрыл строку (DF-16) ──
// Подключённый брокер закрывает обязательство загрузкой файла прямо
// в строке (чужая строка — 404, факт существования не раскрываем).

export async function POST(req: NextRequest, { params }: Params) {
  const auth = await requireBroker(req)
  if (!auth.ok) return auth.response

  const { id } = await params
  try {
    const permit = await permitForBroker(id, auth.broker.id)
    if (!permit) return NextResponse.json({ error: 'Строка не найдена' }, { status: 404 })

    const parsed = await parseDocumentCreateForm(req)
    if (!parsed.ok) return parsed.response

    const result = await closePermitWithDocument(
      id,
      brokerActor(auth.broker),
      { title: parsed.meta.title || permit.title, comment: parsed.meta.comment },
      parsed.file
    )
    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json({ permit: result.permit, documentId: result.documentId }, { status: 201 })
  } catch (e) {
    return apiErrorResponse(e, 'broker permit document POST', 'Не удалось загрузить документ')
  }
}
