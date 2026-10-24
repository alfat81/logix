import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireEmployee } from '@/lib/auth'
import { PatchLeadSchema, LEAD_STATUS_LABELS, type LeadStatus } from '@/lib/leads'
import { checkLeadTransition } from '@/lib/status-machine'
import { apiErrorResponse } from '@/lib/api-errors'
import {
  logActivity,
  employeeActor,
  ACTIVITY_PUBLIC_FIELDS,
  ACTIVITY_FEED_TAKE,
} from '@/lib/activity'

type Params = { params: Promise<{ id: string }> }

// ─── GET /api/admin/leads/[id] — карточка лида ────────────────
export async function GET(req: NextRequest, { params }: Params) {
  const auth = await requireEmployee(req)
  if (!auth.ok) return auth.response

  const { id } = await params
  try {
    const lead = await db.lead.findUnique({
      where: { id },
      include: {
        customer: { select: { id: true, name: true, phone: true, email: true } },
        assignee: { select: { id: true, name: true } },
        options: { orderBy: { createdAt: 'asc' } },
        order: { select: { id: true, number: true, status: true } },
        // Д: брокеры расчёта с оценками (таможенные платежи +
        // разрешительные документы) — оценка на связи, 1:1
        brokers: {
          orderBy: { createdAt: 'asc' },
          include: {
            broker: { select: { id: true, companyName: true, phone: true, isActive: true, isInHouse: true } },
            estimate: true,
          },
        },
        // Ж2: лента событий — свежие сверху, окно ACTIVITY_FEED_TAKE.
        activities: {
          orderBy: { createdAt: 'desc' },
          take: ACTIVITY_FEED_TAKE,
          select: ACTIVITY_PUBLIC_FIELDS,
        },
      },
    })
    if (!lead) {
      return NextResponse.json({ error: 'Лид не найден' }, { status: 404 })
    }

    return NextResponse.json({ lead })
  } catch (e) {
    return apiErrorResponse(e, 'lead GET', 'Не удалось загрузить лид')
  }
}

// ─── PATCH /api/admin/leads/[id] — статус и/или ответственный ──
// Статус (очередь В2 + роадмап 8.1):
//   • статус меняет только человек, автоматов здесь нет (единственный
//     автомат воронки — new→calculated при первом варианте, живёт в В3);
//   • «won» вручную НЕ ставится (409) — только конвертацией в заявку
//     (В4), и он терминальный: из won вести никуда нельзя;
//   • «lost» требует причину (lostReason), уход из lost её чистит;
//   • повторная установка того же статуса — 400, а не молчаливый 200:
//     рассинхрон «я думал, что перевёл» стоит явной ошибки.
// Ответственный (P1-01):
//   • assignedToId — id сотрудника или null (снять); смена — с записью
//     в журнал; повторная установка того же — 400 (контракт статуса);
//   • у won-лида ответственный не меняется вовсе: лид после конвертации
//     — история, ответственность живёт в заявке (переносится В4).
export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await requireEmployee(req, { write: true })
  if (!auth.ok) return auth.response

  const { id } = await params
  try {
    const body = await req.json()
    const parsed = PatchLeadSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Некорректные данные', details: parsed.error.flatten() },
        { status: 400 }
      )
    }
    const { status, lostReason, assignedToId } = parsed.data

    const existing = await db.lead.findUnique({
      where: { id },
      include: { assignee: { select: { id: true, name: true } } },
    })
    if (!existing) {
      return NextResponse.json({ error: 'Лид не найден' }, { status: 404 })
    }

    if (existing.status === 'won') {
      return NextResponse.json(
        { error: 'Лид уже конвертирован в заявку — статус терминальный' },
        { status: 409 }
      )
    }

    // ── Смена ответственного (P1-01) ──
    let newAssigneeName: string | null = null
    if (assignedToId !== undefined) {
      if ((existing.assignedToId ?? null) === assignedToId) {
        const sameName = assignedToId === null ? 'не назначен' : (existing.assignee?.name ?? assignedToId)
        return NextResponse.json(
          { error: `Ответственный уже: ${sameName}` },
          { status: 400 }
        )
      }
      if (assignedToId !== null) {
        const target = await db.employee.findUnique({
          where: { id: assignedToId },
          select: { name: true, isActive: true },
        })
        if (!target) {
          return NextResponse.json({ error: 'Сотрудник не найден' }, { status: 400 })
        }
        if (!target.isActive) {
          return NextResponse.json(
            { error: `Сотрудник «${target.name}» деактивирован — назначить нельзя` },
            { status: 400 }
          )
        }
        newAssigneeName = target.name
      }
    }

    // ── Смена статуса (В2) ──
    if (status !== undefined) {
      if (status === existing.status) {
        return NextResponse.json(
          { error: `Статус лида уже: ${LEAD_STATUS_LABELS[status]}` },
          { status: 400 }
        )
      }
      if (status === 'won') {
        return NextResponse.json(
          { error: 'Статус «Выигран» проставляется только конвертацией в заявку' },
          { status: 409 }
        )
      }
      if (status === 'lost' && !lostReason) {
        return NextResponse.json(
          { error: 'Укажите причину отказа (lostReason)' },
          { status: 400 }
        )
      }

      // ── Матрица переходов лида (P1-05, lib/status-machine.ts) ──
      const transition = checkLeadTransition(existing.status as LeadStatus, status as LeadStatus)
      if (!transition.ok) {
        return NextResponse.json({ error: transition.error }, { status: transition.status })
      }

      // Ручной перевод new→calculated — только при ≥1 варианте расчёта
      // (порог воронки из В3; находка аудита №7: «Рассчитан» без вариантов
      // обесценивал статус и ломал фильтры). Автомат из В3 — POST вариантов
      // — этот порог выполняет всегда, здесь защита от ручного обхода.
      if (existing.status === 'new' && status === 'calculated') {
        const optionsCount = await db.quoteOption.count({ where: { leadId: id } })
        if (optionsCount === 0) {
          return NextResponse.json(
            { error: 'Нельзя перевести в «Рассчитан» без варианта расчёта — сначала добавьте вариант' },
            { status: 409 }
          )
        }
      }

      // lost→new — возврат из терминального: только мастер (как у заявки).
      // Причина отказа сохраняется в журнале — поле чистится при возврате.
      if (existing.status === 'lost' && !auth.employee.roles.includes('master')) {
        return NextResponse.json(
          { error: 'Возврат из «Отказа» доступен только мастеру' },
          { status: 403 }
        )
      }
    }

    const lead = await db.lead.update({
      where: { id },
      data: {
        // Статус: lostReason пишется только вместе со статусом lost; при
        // уходе из lost причина чистится (иначе «Отказ» с хвостом старой
        // причины в карточке после возврата в работу).
        ...(status !== undefined
          ? {
              status,
              ...(status === 'lost'
                ? { lostReason }
                : existing.status === 'lost'
                  ? { lostReason: null }
                  : {}),
            }
          : {}),
        // P1-01: ответственный — id или null (снять)
        ...(assignedToId !== undefined ? { assignedToId } : {}),
      },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        assignee: { select: { id: true, name: true } },
        options: { orderBy: { createdAt: 'asc' } },
        order: { select: { id: true, number: true } },
      },
    })

    // Ж2: журнал — по смысловым частям PATCH, отдельная запись на каждую:
    // лента читается как хроника решений, а не «что-то обновили».
    if (status !== undefined) {
      const prevLabel =
        LEAD_STATUS_LABELS[existing.status as LeadStatus] ?? existing.status
      const statusDescription =
        status === 'lost'
          ? `Статус: ${prevLabel} → ${LEAD_STATUS_LABELS[status]} — причина: ${lostReason}`
          : existing.status === 'lost'
            ? // P1-05: причина отказа не теряется — уходит в журнал вместе с возвратом.
              `Возвращён в работу: ${prevLabel} → ${LEAD_STATUS_LABELS[status]} — причина отказа: ${existing.lostReason ?? 'не указана'}`
            : `Статус: ${prevLabel} → ${LEAD_STATUS_LABELS[status]}`
      await logActivity(
        { leadId: id },
        employeeActor(auth.employee),
        'lead_status_changed',
        statusDescription,
      )
    }
    let assigneeMessage: string | null = null
    if (assignedToId !== undefined) {
      const prevName = existing.assignee?.name ?? null
      const description =
        assignedToId === null
          ? `Ответственный снят: ${prevName ?? '—'}`
          : prevName
            ? `Ответственный: ${prevName} → ${newAssigneeName}`
            : `Назначен ответственный: ${newAssigneeName}`
      await logActivity(
        { leadId: id },
        employeeActor(auth.employee),
        'lead_assignee_changed',
        description,
      )
      assigneeMessage = assignedToId === null ? 'Ответственный снят' : `Ответственный: ${newAssigneeName}`
    }

    const messageParts: string[] = []
    if (status !== undefined) messageParts.push(`Статус лида: ${LEAD_STATUS_LABELS[status]}`)
    if (assigneeMessage) messageParts.push(assigneeMessage)

    return NextResponse.json({
      lead,
      message: messageParts.join('; ') || 'Лид обновлён',
    })
  } catch (e) {
    return apiErrorResponse(e, 'lead PATCH', 'Не удалось обновить лид')
  }
}

// ─── DELETE /api/admin/leads/[id] — удалить лид ───────────────
// Только для лидов БЕЗ заявки: лид с заявкой (won, В4) — уже история
// воронки, его удаление разорвёт связь Order.leadId, поэтому 409.
// Варианты расчёта (QuoteOption) уходят каскадом вместе с лидом
// (onDelete: Cascade в схеме В1).
export async function DELETE(req: NextRequest, { params }: Params) {
  const auth = await requireEmployee(req, { write: true })
  if (!auth.ok) return auth.response

  const { id } = await params
  try {
    const lead = await db.lead.findUnique({
      where: { id },
      include: { order: { select: { id: true } } },
    })
    if (!lead) {
      return NextResponse.json({ error: 'Лид не найден' }, { status: 404 })
    }
    if (lead.order) {
      return NextResponse.json(
        { error: 'Нельзя удалить лид, конвертированный в заявку' },
        { status: 409 }
      )
    }

    await db.lead.delete({ where: { id } })
    return NextResponse.json({ ok: true, message: 'Лид удалён' })
  } catch (e) {
    return apiErrorResponse(e, 'lead DELETE', 'Не удалось удалить лид')
  }
}
