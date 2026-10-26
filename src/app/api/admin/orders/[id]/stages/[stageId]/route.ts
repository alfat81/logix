import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireEmployee } from '@/lib/auth'
import { STAGE_STATUSES, STAGE_STATUS_LABELS, type StageStatus } from '@/lib/order-constants'
import { isStageMandatory, todayUtcMidnight, utcDayStart } from '@/lib/orders'
import { apiErrorResponse } from '@/lib/api-errors'
import { logActivity, employeeActor, fmtRuDate, type ActivityType } from '@/lib/activity'

type Params = { params: Promise<{ id: string; stageId: string }> }

// ─── PATCH /api/admin/orders/[id]/stages/[stageId] ────────────
// Смена статуса этапа, дат план/факт (факт — не в будущем, план в
// прошлом — предупреждение: P1-06), перестановка порядка,
// назначение/смена/снятие подрядчика-исполнителя (Г3). Порядок можно
// менять только у необязательных этапов (роадмап, раздел 3: «порядок
// среди последних — на его усмотрение»).
const PatchStageSchema = z.object({
  status: z.enum(STAGE_STATUSES).optional(),
  plannedDate: z.string().datetime().nullable().optional(),
  actualDate: z.string().datetime().nullable().optional(),
  sequence: z.number().int().min(1).optional(),
  // Исполнитель этапа (Г3): id подрядчика из пула | null = снять.
  // Пустая строка — НЕ «снять», а некорректные данные (400): явный
  // null в JSON однозначнее молчаливой конвертации.
  contractorId: z.string().trim().min(1).nullable().optional(),
})

export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await requireEmployee(req, { write: true })
  if (!auth.ok) return auth.response

  const { id, stageId } = await params
  try {
    const body = await req.json()
    const parsed = PatchStageSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Некорректные данные', details: parsed.error.flatten() },
        { status: 400 }
      )
    }
    const data = parsed.data
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'Нечего обновлять' }, { status: 400 })
    }

    const stage = await db.orderStageInstance.findFirst({ where: { id: stageId, orderId: id } })
    if (!stage) {
      return NextResponse.json({ error: 'Этап не найден в этой заявке' }, { status: 404 })
    }

    // ── Валидация дат (P1-06) ──────────────────────────
    // Факт не может быть в будущем: опечатка «2030» не должна ломать
    // сводку просрочки и доверие к печатной форме. Граница «сегодня»
    // — по UTC-дню (правило todayUtcMidnight, даты приходят UTC-полуночью;
    // любой момент сегодняшнего дня — валиден).
    if (data.actualDate) {
      const actual = new Date(data.actualDate)
      if (utcDayStart(actual) > todayUtcMidnight()) {
        return NextResponse.json(
          { error: 'Фактическая дата не может быть в будущем' },
          { status: 400 }
        )
      }
    }
    // Плановая дата в прошлом — предупреждение, НЕ ошибка (P1-06):
    // менеджер может осознанно фиксировать отстающий план, но ответ
    // подсветит этот момент (UI покажет предупреждение из warnings).
    const warnings: string[] = []
    if (data.plannedDate && utcDayStart(new Date(data.plannedDate)) < todayUtcMidnight()) {
      warnings.push('Плановая дата этапа — в прошлом: проверьте, не нужно ли её актуализировать')
    }

    // Перестановка — только для необязательных: порядок обязательного
    // ядра фиксирован каталогом.
    if (data.sequence !== undefined && (await isStageMandatory(stage.stageCode))) {
      return NextResponse.json(
        { error: 'Порядок обязательных этапов фиксирован' },
        { status: 400 }
      )
    }

    // ── Назначение/смена/снятие подрядчика (Г3) ──
    // Серверная проверка пула: подрядчик существует и isActive —
    // исключённый на НОВЫЕ этапы не назначается (мягкое исключение).
    // Снятие (null) и уже назначенный исключённый — живут: мягкое
    // исключение не рвёт существующие назначения.
    // Снятие подрядчика статус этапа НЕ трогает: contractorId=null
    // обнуляет только исполнителя; статус меняется исключительно
    // явным data.status в том же запросе (симметрия 8.1 — решает
    // человек, не побочный эффект).
    let contractorName: string | null = null
    if (data.contractorId) {
      const contractor = await db.contractor.findUnique({
        where: { id: data.contractorId },
        select: { id: true, companyName: true, isActive: true },
      })
      if (!contractor) {
        return NextResponse.json({ error: 'Подрядчик не найден' }, { status: 404 })
      }
      if (!contractor.isActive) {
        return NextResponse.json(
          {
            error: `Подрядчик «${contractor.companyName}» исключён из пула — назначение невозможно`,
          },
          { status: 409 }
        )
      }
      contractorName = contractor.companyName
    }

    // Имя этапа для описаний журнала (Ж2): живой lookup по каталогу —
    // тот же паттерн, что GET карточки (stageCode — служебный код,
    // человеку нужно название).
    const catalogEntry = await db.orderStageCatalog.findUnique({
      where: { code: stage.stageCode },
      select: { name: true },
    })
    const stageName = catalogEntry?.name ?? stage.stageCode

    // Перевод в «Завершён» без явно проставленного факта — фиксируем
    // факт текущим моментом (иначе менеджер ставит дату руками в двух
    // местах; явно переданная дата всегда важнее).
    const actualDate =
      data.actualDate !== undefined
        ? data.actualDate
          ? new Date(data.actualDate)
          : null
        : data.status === 'done' && !stage.actualDate
          ? new Date()
          : undefined

    const updated = await db.orderStageInstance.update({
      where: { id: stageId },
      data: {
        ...(data.status ? { status: data.status as StageStatus } : {}),
        ...(data.plannedDate !== undefined
          ? { plannedDate: data.plannedDate ? new Date(data.plannedDate) : null }
          : {}),
        ...(actualDate !== undefined ? { actualDate } : {}),
        ...(data.sequence !== undefined ? { sequence: data.sequence } : {}),
        ...(data.contractorId !== undefined ? { contractorId: data.contractorId } : {}),
      },
      include: {
        contractor: { select: { id: true, companyName: true, phone: true, isActive: true } },
      },
    })

    // Сообщение по частям: назначение/снятие подрядчика и смена статуса
    // — равноправные события одного PATCH, даты/порядок — фон.
    const parts: string[] = []
    if (data.contractorId !== undefined) {
      parts.push(contractorName ? `подрядчик: ${contractorName}` : 'подрядчик снят')
    }
    if (data.status) parts.push(`этап: ${STAGE_STATUS_LABELS[data.status]}`)
    if (parts.length === 0) parts.push('этап обновлён')

    // Ж2: журнал — теми же частями, что и сообщение (равноправные
    // события = отдельные записи), но с полным контекстом: имя этапа
    // и прежние значения. Прежний статус — из stage (до update).
    const events: Array<{ type: ActivityType; description: string }> = []
    if (data.contractorId !== undefined) {
      events.push({
        type: 'stage_contractor_changed',
        description: contractorName
          ? `Этап «${stageName}»: назначен исполнитель — ${contractorName}`
          : `Этап «${stageName}»: исполнитель снят`,
      })
    }
    if (data.status) {
      events.push({
        type: 'stage_status_changed',
        description: `Этап «${stageName}»: ${STAGE_STATUS_LABELS[stage.status as StageStatus] ?? stage.status} → ${STAGE_STATUS_LABELS[data.status]}`,
      })
    }
    if (data.plannedDate !== undefined) {
      events.push({
        type: 'stage_planned_changed',
        description: data.plannedDate
          ? `Этап «${stageName}»: плановая дата — ${fmtRuDate(new Date(data.plannedDate))}`
          : `Этап «${stageName}»: плановая дата снята`,
      })
    }
    if (data.sequence !== undefined) {
      events.push({
        type: 'stage_updated',
        description: `Этап «${stageName}»: порядок в заявке → ${data.sequence}`,
      })
    }
    for (const ev of events) {
      await logActivity({ orderId: id }, employeeActor(auth.employee), ev.type, ev.description)
    }

    return NextResponse.json({
      stage: updated,
      message: parts.join('; '),
      ...(warnings.length > 0 ? { warnings } : {}),
    })
  } catch (e) {
    return apiErrorResponse(e, 'stage PATCH', 'Не удалось обновить этап')
  }
}

// ─── DELETE /api/admin/orders/[id]/stages/[stageId] ───────────
// Серверная защита обязательного ядра (роадмап, раздел 3): удаление
// разрешено только при isMandatory=false у кода этапа в каталоге —
// не только скрытой кнопкой в UI — серверная проверка обязательна.
// Назначенный на удаляемый необязательный этап подрядчик обнуляется
// вместе с этапом (Cascade по заявке / SetNull не участвует — этап
// уходит целиком, вместе с назначением).
export async function DELETE(req: NextRequest, { params }: Params) {
  const auth = await requireEmployee(req, { write: true })
  if (!auth.ok) return auth.response

  const { id, stageId } = await params
  try {
    const stage = await db.orderStageInstance.findFirst({ where: { id: stageId, orderId: id } })
    if (!stage) {
      return NextResponse.json({ error: 'Этап не найден в этой заявке' }, { status: 404 })
    }

    if (await isStageMandatory(stage.stageCode)) {
      return NextResponse.json(
        { error: 'Обязательный этап нельзя удалить из заявки' },
        { status: 403 }
      )
    }

    // Ж2: имя этапа — до удаления (после запись уже недоступна, а
    // код в описании — плохо читается).
    const catalogEntry = await db.orderStageCatalog.findUnique({
      where: { code: stage.stageCode },
      select: { name: true },
    })

    await db.orderStageInstance.delete({ where: { id: stageId } })

    await logActivity(
      { orderId: id },
      employeeActor(auth.employee),
      'stage_removed',
      `Удалён этап «${catalogEntry?.name ?? stage.stageCode}»`,
    )
    return NextResponse.json({ ok: true })
  } catch (e) {
    return apiErrorResponse(e, 'stage DELETE', 'Не удалось удалить этап')
  }
}
