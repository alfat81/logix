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

// ─── PATCH /api/admin/leads/[id] — ручная смена статуса (В2) ──
// Правила (очередь В2 + роадмап 8.1):
//   • статус меняет только человек, автоматов здесь нет (единственный
//     автомат воронки — new→calculated при первом варианте, живёт в В3);
//   • «won» вручную НЕ ставится (409) — только конвертацией в заявку
//     (В4), и он терминальный: из won вести никуда нельзя;
//   • «lost» требует причину (lostReason), уход из lost её чистит;
//   • повторная установка того же статуса — 400, а не молчаливый 200:
//     рассинхрон «я думал, что перевёл» стоит явной ошибки.
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
    const { status, lostReason } = parsed.data

    const existing = await db.lead.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Лид не найден' }, { status: 404 })
    }

    if (existing.status === 'won') {
      return NextResponse.json(
        { error: 'Лид уже конвертирован в заявку — статус терминальный' },
        { status: 409 }
      )
    }
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

    const lead = await db.lead.update({
      where: { id },
      data: {
        status,
        // lostReason пишется только вместе со статусом lost; при уходе
        // из lost причина чистится (иначе «Отказ» с хвостом старой
        // причины в карточке после возврата в работу).
        ...(status === 'lost'
          ? { lostReason }
          : existing.status === 'lost'
            ? { lostReason: null }
            : {}),
      },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        options: { orderBy: { createdAt: 'asc' } },
        order: { select: { id: true, number: true } },
      },
    })

    // Ж2: журнал — смена статуса воронки; причина отказа и возврат
    // в работу — в описании (человеку в ленте нужно «почему», не код).
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

    return NextResponse.json({
      lead,
      message: `Статус лида: ${LEAD_STATUS_LABELS[status]}`,
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
