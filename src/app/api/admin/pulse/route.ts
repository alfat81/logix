import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireEmployee } from '@/lib/auth'
import { apiErrorResponse } from '@/lib/api-errors'
import { eventWhereFor } from '@/lib/audience'
import { projectActors, STAFF_READER } from '@/lib/actor-name'
import { isStaffOnlyRow } from '@/lib/activity'
import { loadPulseCore } from '@/lib/pulse-db'
import {
  PULSE_CARGO_LIMIT,
  PULSE_EVENTS_LIMIT,
  PULSE_EVENT_WINDOW_HOURS,
} from '@/lib/pulse'

// ─── GET /api/admin/pulse — «Пульс» владельца (DF-07) ────────────────
// Ответ на «что происходит» с телефона (Г1): цифры, где груз, кто
// тормозит, последние события. Только агрегаты по существующим таблицам,
// новых сущностей нет. Активная заявка — ORDER_ACTIVE_STATUSES (одно
// определение с Ж5 и счётчиками §4.1).
//
// Права: только роль master (менеджер получает 403 — Пульс показывает
// положение всего дела, не персональную очередь). Срезы отдаются
// лимитом, счётчики — полные (тот же размен, что в Ж5).
//
// Цифры, «Где груз» и «Кто тормозит» — общая с сводкой владельцу (DF-08)
// выборка lib/pulse-db.ts (v0.7.6): числа письма и экрана сходятся по
// построению. События — второй запрос (в письме их нет, DF-08).
export async function GET(req: NextRequest) {
  const auth = await requireEmployee(req)
  if (!auth.ok) return auth.response
  if (!auth.employee.roles.includes('master')) {
    return NextResponse.json({ error: 'Пульс доступен только мастеру' }, { status: 403 })
  }

  try {
    const now = new Date()
    const cutoff24 = new Date(now.getTime() - PULSE_EVENT_WINDOW_HOURS * 24 * 60 * 60 * 1000)
    const [core, eventRows] = await Promise.all([
      loadPulseCore(now),
      // Блок 4: события за сутки, видимые сотрудникам (DF-01 аудитория),
      // свежие сверху, лимитом.
      db.activity.findMany({
        where: { ...eventWhereFor('staff'), createdAt: { gte: cutoff24 } },
        orderBy: { createdAt: 'desc' },
        take: PULSE_EVENTS_LIMIT,
      }),
    ])
    const stagedEvents = await projectActors(eventRows, STAFF_READER)

    return NextResponse.json({
      generatedAt: now.toISOString(),
      stats: core.stats,
      cargo: core.cargo.slice(0, PULSE_CARGO_LIMIT),
      cargoTotal: core.cargoTotal,
      slowing: core.slowing,
      events: stagedEvents.map((a) => ({
        id: a.id,
        actorName: a.actorName,
        type: a.type,
        description: a.description,
        isInternal: isStaffOnlyRow(a),
        createdAt: a.createdAt.toISOString(),
        leadId: a.leadId,
        orderId: a.orderId,
      })),
    })
  } catch (e) {
    return apiErrorResponse(e, 'pulse GET', 'Не удалось загрузить Пульс')
  }
}
