// no-event: события пишет ядро permits-db (permit_added/permit_received/permit_waived/permit_overdue через emitEvent) — роут только авторизует и валидирует
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireEmployee } from '@/lib/auth'
import { apiErrorResponse } from '@/lib/api-errors'
import { employeeActor } from '@/lib/activity'
import { PatchPermitSchema } from '@/lib/permits'
import { patchPermit } from '@/lib/permits-db'

type Params = { params: Promise<{ id: string }> }

// ─── PATCH /api/admin/permits/[id] — правка строки (только сотрудник, DF-16) ──
// Поля строки + «не требуется» с причиной. Перевод в received — только
// загрузкой документа (POST /api/admin/permits/[id]/document).

export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await requireEmployee(req, { write: true })
  if (!auth.ok) return auth.response

  const { id } = await params
  try {
    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Некорректный JSON в теле запроса' }, { status: 400 })
    }
    const parsed = PatchPermitSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Некорректные данные', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const permit = await db.$transaction(async (tx) =>
      patchPermit(id, parsed.data, employeeActor(auth.employee), tx)
    )
    if (!permit) return NextResponse.json({ error: 'Строка не найдена' }, { status: 404 })
    return NextResponse.json({ permit })
  } catch (e) {
    return apiErrorResponse(e, 'admin permit PATCH', 'Не удалось обновить строку')
  }
}
