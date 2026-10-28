import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireEmployee } from '@/lib/auth'
import { apiErrorResponse } from '@/lib/api-errors'
import { employeeActor, logInternalNote } from '@/lib/activity'
import { NOTE_MAX_LENGTH } from '@/lib/note-constants'

type Params = { params: Promise<{ id: string }> }

// ─── POST /api/admin/orders/[id]/notes — внутренняя заметка (Ж3) ──
// Заметка — событие общего журнала (type note_added, isInternal: true):
// текст — description, автор — сотрудник из сессии, время — createdAt.
// Лента карточки заявки показывает её с бейджем «Заметка»; подрядчику
// и клиенту staff-only-события не отдаются (eventWhereFor).
// У заявки нет счётчика «движения» (экран Ж5 смотрит на планы этапов,
// а не на обновления заявки) — touch, в отличие от лида, не нужен.
const NoteSchema = z.object({
  text: z.string().trim().min(1).max(NOTE_MAX_LENGTH),
})

export async function POST(req: NextRequest, { params }: Params) {
  const auth = await requireEmployee(req, { write: true })
  if (!auth.ok) return auth.response

  const { id } = await params
  try {
    const body = await req.json().catch(() => null)
    const parsed = NoteSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: `Текст заметки обязателен (до ${NOTE_MAX_LENGTH} символов)` },
        { status: 400 },
      )
    }

    const order = await db.order.findUnique({ where: { id }, select: { id: true } })
    if (!order) {
      return NextResponse.json({ error: 'Заявка не найдена' }, { status: 404 })
    }

    // logInternalNote бросает ошибку записи наверх (заметка — действие
    // пользователя, терять текст молча нельзя) — здесь это 500 из catch.
    const note = await logInternalNote(
      { orderId: id },
      employeeActor(auth.employee),
      parsed.data.text,
    )

    return NextResponse.json({ note, message: 'Заметка добавлена' })
  } catch (e) {
    return apiErrorResponse(e, 'order notes POST', 'Не удалось сохранить заметку')
  }
}
