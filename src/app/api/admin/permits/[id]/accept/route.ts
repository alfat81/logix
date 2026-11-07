// no-event: события пишут ядра (permits-db: permit_*/check_* через emitEvent) — роут только авторизует и валидирует
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireEmployee } from '@/lib/auth'
import { apiErrorResponse } from '@/lib/api-errors'
import { employeeActor } from '@/lib/activity'
import { acceptPermit, PermitLinkError } from '@/lib/permits-db'

type Params = { params: Promise<{ id: string }> }

// ─── POST /api/admin/permits/[id]/accept — «Принять» (DF-26 волна 2, §5.4/§11.2) ──
// Сотрудник принимает документ по требованию «На проверке»: submitted →
// received, acceptedVersion = текущая версия связанного документа,
// двойной снимок принявшего, событие permit_received. Атомарный переход
// (updateMany по статусу): двойной accept — второй запрос получает 409.

export async function POST(req: NextRequest, { params }: Params) {
  const auth = await requireEmployee(req, { write: true })
  if (!auth.ok) return auth.response

  const { id } = await params
  try {
    const permit = await db.$transaction((tx) => acceptPermit(id, employeeActor(auth.employee), tx))
    return NextResponse.json({ permit })
  } catch (e) {
    if (e instanceof PermitLinkError) {
      return NextResponse.json({ error: e.message }, { status: e.status })
    }
    return apiErrorResponse(e, 'admin permit accept POST', 'Не удалось принять документ')
  }
}
