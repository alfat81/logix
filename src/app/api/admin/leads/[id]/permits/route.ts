// no-event: события пишет ядро permits-db (permit_added/permit_received/permit_waived/permit_overdue через emitEvent) — роут только авторизует и валидирует
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireEmployee } from '@/lib/auth'
import { apiErrorResponse } from '@/lib/api-errors'
import { employeeActor } from '@/lib/activity'
import { CreatePermitSchema } from '@/lib/permits'
import { PERMIT_FIELDS, createPermit } from '@/lib/permits-db'

type Params = { params: Promise<{ id: string }> }

// ─── GET/POST /api/admin/leads/[id]/permits — разрешительные запроса (DF-16) ──
// Добавляет сотрудник (карточка DF-16: «кто добавляет: брокер и
// сотрудники»); создание + событие permit_added в одной транзакции.

export async function GET(req: NextRequest, { params }: Params) {
  const auth = await requireEmployee(req)
  if (!auth.ok) return auth.response

  const { id } = await params
  try {
    const lead = await db.lead.findUnique({ where: { id }, select: { id: true } })
    if (!lead) return NextResponse.json({ error: 'Запрос не найден' }, { status: 404 })
    const permits = await db.permitRequirement.findMany({
      where: { leadId: id },
      select: PERMIT_FIELDS,
      orderBy: [{ isBlocking: 'desc' }, { createdAt: 'asc' }],
    })
    return NextResponse.json({ permits })
  } catch (e) {
    return apiErrorResponse(e, 'admin lead permits GET', 'Не удалось загрузить разрешительные')
  }
}

export async function POST(req: NextRequest, { params }: Params) {
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
    const parsed = CreatePermitSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Некорректные данные', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const lead = await db.lead.findUnique({ where: { id }, select: { order: { select: { id: true } } } })
    if (!lead) return NextResponse.json({ error: 'Запрос не найден' }, { status: 404 })

    const permit = await db.$transaction(async (tx) =>
      createPermit(lead.order ? { orderId: lead.order.id } : { leadId: id }, employeeActor(auth.employee), parsed.data, tx)
    )
    return NextResponse.json({ permit }, { status: 201 })
  } catch (e) {
    return apiErrorResponse(e, 'admin lead permits POST', 'Не удалось добавить разрешительный')
  }
}
