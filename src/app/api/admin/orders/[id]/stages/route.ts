import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireEmployee } from '@/lib/auth'
import { logActivity, employeeActor, fmtRuDate } from '@/lib/activity'

type Params = { params: Promise<{ id: string }> }

// ─── POST /api/admin/orders/[id]/stages — добавить этап ───────
// Менеджер добавляет НЕОБЯЗАТЕЛЬНЫЕ этапы из каталога поверх
// обязательного ядра (роадмап, раздел 3). Дубликат кода в рамках
// заявки отклоняется — у заявки не бывает двух «Погрузок» из
// одного и того же справочника; отдельный случай перегрузки —
// своя запись в каталоге (например, reloading_*).
const AddStageSchema = z.object({
  stageCode: z.string().min(1, 'Выберите этап'),
  plannedDate: z.string().datetime().optional().nullable(),
})

export async function POST(req: NextRequest, { params }: Params) {
  const auth = await requireEmployee(req, { write: true })
  if (!auth.ok) return auth.response

  const { id } = await params
  try {
    const body = await req.json()
    const parsed = AddStageSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Некорректные данные', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const order = await db.order.findUnique({ where: { id }, select: { id: true } })
    if (!order) {
      return NextResponse.json({ error: 'Заявка не найдена' }, { status: 404 })
    }

    const catalogEntry = await db.orderStageCatalog.findUnique({
      where: { code: parsed.data.stageCode },
    })
    if (!catalogEntry) {
      return NextResponse.json({ error: 'Этап не найден в каталоге' }, { status: 404 })
    }

    const duplicate = await db.orderStageInstance.findFirst({
      where: { orderId: id, stageCode: parsed.data.stageCode },
      select: { id: true },
    })
    if (duplicate) {
      return NextResponse.json(
        { error: `Этап «${catalogEntry.name}» уже есть в этой заявке` },
        { status: 409 }
      )
    }

    // Порядок — в конец списка (max+1); перестановка необязательных —
    // отдельной операцией PATCH sequence.
    const last = await db.orderStageInstance.findFirst({
      where: { orderId: id },
      orderBy: { sequence: 'desc' },
      select: { sequence: true },
    })

    const stage = await db.orderStageInstance.create({
      data: {
        orderId: id,
        stageCode: parsed.data.stageCode,
        sequence: (last?.sequence ?? 0) + 1,
        status: 'not_started',
        plannedDate: parsed.data.plannedDate ? new Date(parsed.data.plannedDate) : null,
      },
    })

    // Ж2: журнал — добавление необязательного этапа поверх ядра.
    await logActivity(
      { orderId: id },
      employeeActor(auth.employee),
      'stage_added',
      `Добавлен этап «${catalogEntry.name}»${
        parsed.data.plannedDate ? ` — план: ${fmtRuDate(new Date(parsed.data.plannedDate))}` : ''
      }`,
    )

    return NextResponse.json({ stage }, { status: 201 })
  } catch (e) {
    console.error('[stages POST] error:', e)
    return NextResponse.json({ error: 'Не удалось добавить этап' }, { status: 500 })
  }
}
