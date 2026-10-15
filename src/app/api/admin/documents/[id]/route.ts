import { NextRequest, NextResponse } from 'next/server'
import { requireEmployee } from '@/lib/auth'
import { employeeActor } from '@/lib/activity'
import { apiErrorResponse } from '@/lib/api-errors'
import { deleteDocument } from '@/lib/documents'

type Params = { params: Promise<{ id: string }> }

// ─── Удаление документа (Е) — только менеджер ─────────────────────
// Удаляет документ ЦЕЛИКОМ со всеми версиями (версий по одной нет:
// номерация с дырками ломала бы историю). След остаётся в ленте
// сделки (document_deleted). Клиент и брокер удалять не могут —
// у внешних участников обмен только additive (свои загрузки видят
// все трое, «отменить отправку» = попросить менеджера).
export async function DELETE(req: NextRequest, { params }: Params) {
  const auth = await requireEmployee(req, { write: true })
  if (!auth.ok) return auth.response

  const { id } = await params
  try {
    const result = await deleteDocument(id, employeeActor(auth.employee))
    if (!result) {
      return NextResponse.json({ error: 'Документ не найден' }, { status: 404 })
    }
    return NextResponse.json({ message: `Документ «${result.title}» удалён` })
  } catch (e) {
    return apiErrorResponse(e, 'document DELETE', 'Не удалось удалить документ')
  }
}
