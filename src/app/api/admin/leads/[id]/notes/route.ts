import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireEmployee } from '@/lib/auth'
import { apiErrorResponse } from '@/lib/api-errors'
import { employeeActor, logInternalNote } from '@/lib/activity'
import { NOTE_MAX_LENGTH } from '@/lib/note-constants'

type Params = { params: Promise<{ id: string }> }

// ─── POST /api/admin/leads/[id]/notes — внутренняя заметка (Ж3) ────
// Заметка по лиду — «движение» в терминах Ж5 (менеджер занимался
// лидом: «лид без изменений дольше 3 дней» не должен гореть, когда по
// нему вчера оставили заметку «ждём ответа»). Поэтому запись заметки и
// touch lead.updatedAt идут В ОДНОЙ ТРАНЗАКЦИИ (паттерн В3, варианты):
// откат одной операции откатывает и вторую — «движение» без заметки
// или заметка без «движения» не рождаются.
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

    const lead = await db.lead.findUnique({ where: { id }, select: { id: true } })
    if (!lead) {
      return NextResponse.json({ error: 'Лид не найден' }, { status: 404 })
    }

    const note = await db.$transaction(async (tx) => {
      const created = await logInternalNote(
        { leadId: id },
        employeeActor(auth.employee),
        parsed.data.text,
        tx,
      )
      // Touch по образцу В3: @updatedAt тронулся бы и от неявного
      // обновления, но явная запись читается яснее намерения.
      await tx.lead.update({ where: { id }, data: { updatedAt: new Date() } })
      return created
    })

    return NextResponse.json({ note, message: 'Заметка добавлена' })
  } catch (e) {
    return apiErrorResponse(e, 'lead notes POST', 'Не удалось сохранить заметку')
  }
}
