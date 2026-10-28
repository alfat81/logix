import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireContractor } from '@/lib/contractor-auth'
import { apiErrorResponse } from '@/lib/api-errors'
import { STAGE_STATUS_LABELS, type StageStatus } from '@/lib/order-constants'
import { contractorActor } from '@/lib/activity'
import { emitEvent } from '@/lib/events'

type Params = { params: Promise<{ id: string; stageId: string }> }

// ─── PATCH /api/contractor/orders/[id]/stages/[stageId] (Г4) ──────
// Единственный write портала: статус СВОЕГО этапа, и только из трёх
// значений — «В работе | Завершён | Проблема». Откат в «Не начат» —
// прерогатива менеджера (очередь Г4): раз работа началась, «неначатое»
// состояние исполнителю недоступно. Всё прочее (даты, порядок,
// исполнитель, поля заявки) — только через кабинет менеджера; чужие
// поля тела молча отсекаются zod'ом (unknown keys strip), а запрос
// без допустимых полей — 400 «нечего обновлять»: повысить себя через
// тело запроса нельзя.
const CONTRACTOR_STAGE_STATUSES = ['in_progress', 'done', 'problem'] as const

const PatchContractorStageSchema = z.object({
  status: z.enum(CONTRACTOR_STAGE_STATUSES, {
    errorMap: (_issue, ctx) => {
      if ((ctx.data as string) === 'not_started') {
        return { message: 'Вернуть этап в «Не начат» может только менеджер' }
      }
      return { message: 'Доступны статусы: В работе, Завершён, Проблема' }
    },
  }),
})

export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await requireContractor(req)
  if (!auth.ok) return auth.response

  const { id, stageId } = await params
  try {
    const body = await req.json()
    const parsed = PatchContractorStageSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Некорректные данные', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    // Заявка должна быть «его» (хоть один свой этап) — иначе 404,
    // не раскрываем чужие сделки (тот же принцип, что карточка).
    const order = await db.order.findFirst({
      where: { id, stages: { some: { contractorId: auth.contractor.id } } },
      select: { id: true },
    })
    if (!order) {
      return NextResponse.json({ error: 'Заявка не найдена' }, { status: 404 })
    }

    const stage = await db.orderStageInstance.findFirst({
      where: { id: stageId, orderId: id },
    })
    if (!stage) {
      return NextResponse.json({ error: 'Этап не найден в этой заявке' }, { status: 404 })
    }
    // Чужой этап в «своей» заявке — виден (контекст цепочки), но
    // трогать нельзя: 403 (очередь Г6: «чужой этап 403»).
    if (stage.contractorId !== auth.contractor.id) {
      return NextResponse.json(
        { error: 'Это не ваш этап — статус меняет его исполнитель или менеджер' },
        { status: 403 }
      )
    }

    // done без факта — фиксируем текущим моментом (та же логика, что
    // менеджерский роут этапов Б3/Г3: дата-факт, не статус — триггер
    // уместен; симметрия: plannedDate ставит менеджер при назначении).
    const actualDate =
      parsed.data.status === 'done' && !stage.actualDate ? new Date() : undefined

    const updated = await db.orderStageInstance.update({
      where: { id: stageId },
      data: {
        status: parsed.data.status,
        ...(actualDate ? { actualDate } : {}),
      },
    })

    // Ж2: журнал — событие от ПОДРЯДЧИКА (актёр contractor, имя —
    // companyName-снимок): менеджер в ленте заявки видит, кто именно
    // двинул этап, без сверки с назначениями.
    const catalogEntry = await db.orderStageCatalog.findUnique({
      where: { code: stage.stageCode },
      select: { name: true },
    })
    // Contract 0.6.5: обёртка logActivity удалена (DEPRECATIONS) —
    // замороженный роут пишет через emitEvent, как весь остальной код
    // (перевод механический, поведение не меняется; D31 не нарушен:
    // развитие кабинета по-прежнему запрещено).
    await emitEvent(db, {
      target: { orderId: id },
      actor: contractorActor(auth.contractor),
      type: 'stage_status_changed',
      description: `Этап «${catalogEntry?.name ?? stage.stageCode}»: ${
        STAGE_STATUS_LABELS[stage.status as StageStatus] ?? stage.status
      } → ${STAGE_STATUS_LABELS[parsed.data.status]}`,
    })

    return NextResponse.json({
      stage: updated,
      message: `Этап: ${STAGE_STATUS_LABELS[parsed.data.status]}`,
    })
  } catch (e) {
    return apiErrorResponse(e, 'contractor/stage PATCH', 'Не удалось обновить этап')
  }
}
