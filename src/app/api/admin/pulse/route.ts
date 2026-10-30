import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireEmployee } from '@/lib/auth'
import { apiErrorResponse } from '@/lib/api-errors'
import { getSetting } from '@/lib/settings'
import { eventWhereFor } from '@/lib/audience'
import { projectActors, STAFF_READER } from '@/lib/actor-name'
import { isStaffOnlyRow } from '@/lib/activity'
import {
  PULSE_CARGO_LIMIT,
  PULSE_EVENTS_LIMIT,
  PULSE_EVENT_WINDOW_HOURS,
  PULSE_SLOWING_GROUP_LIMIT,
  buildCargoRow,
  groupSlowingOrders,
  type PulseStats,
} from '@/lib/pulse'
import { todayUtcMidnight } from '@/lib/order-summary'

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
// Round-trip'ы — один на блок: цифры+груз+тормозят считаются из ОДНОЙ
// выборки активных заявок с этапами (MVP-масштаб: сотни заявок —
// копейки, то же решение, что в Ж5); события — второй запрос; порог —
// из реестра настроек (DF-00D).
export async function GET(req: NextRequest) {
  const auth = await requireEmployee(req)
  if (!auth.ok) return auth.response
  if (!auth.employee.roles.includes('master')) {
    return NextResponse.json({ error: 'Пульс доступен только мастеру' }, { status: 403 })
  }

  try {
    const now = new Date()
    const dayMs = 24 * 60 * 60 * 1000
    const cutoff24 = new Date(now.getTime() - PULSE_EVENT_WINDOW_HOURS * dayMs)
    // DF-05: порог «ждут дольше N часов» — настройка waiting.attention_hours.
    const attentionHours = await getSetting('waiting.attention_hours')
    const waitingCutoff = new Date(now.getTime() - attentionHours * 60 * 60 * 1000)
    const todayUtc = todayUtcMidnight()

    const [newLeads24h, activeOrders, catalog, eventRows] = await Promise.all([
      // Блок 1: новые запросы за 24 ч (поток входа, включая ушедшие
      // в won/lost за сутки — считаем вход, не активный портфель).
      db.lead.count({ where: { createdAt: { gte: cutoff24 } } }),
      // Блоки 1/2/3 из одной выборки: активные заявки с этапами и
      // вычисляемыми колонками ожидания (DF-05).
      db.order.findMany({
        where: { status: { in: ['calculating', 'confirmed', 'in_progress'] } },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          number: true,
          status: true,
          customer: { select: { name: true } },
          waitingOnKind: true,
          waitingReason: true,
          waitingSince: true,
          stages: {
            orderBy: { sequence: 'asc' },
            select: {
              stageCode: true,
              status: true,
              plannedDate: true,
              contractor: { select: { companyName: true } },
            },
          },
        },
      }),
      db.orderStageCatalog.findMany({ select: { code: true, name: true } }),
      // Блок 4: события за сутки, видимые сотрудникам (DF-01 аудитория),
      // свежие сверху, лимитом.
      db.activity.findMany({
        where: { ...eventWhereFor('staff'), createdAt: { gte: cutoff24 } },
        orderBy: { createdAt: 'desc' },
        take: PULSE_EVENTS_LIMIT,
      }),
    ])
    const stagedEvents = await projectActors(eventRows, STAFF_READER)

    const stageNames = new Map(catalog.map((c) => [c.code, c.name]))

    // Блок 2 «Где груз»: строки по всем активным, отдаются лимитом
    // (счётчик полный — «и ещё N» ведёт в список заявок).
    const cargoRows = activeOrders.map((o) => buildCargoRow(o, stageNames, todayUtc))

    // Блок 3 «Кто тормозит»: группировка по waitingOnKind (DF-05).
    const slowing = groupSlowingOrders(activeOrders, PULSE_SLOWING_GROUP_LIMIT)

    const stats: PulseStats = {
      newLeads24h,
      activeOrders: activeOrders.length,
      inProgress: activeOrders.filter((o) => o.status === 'in_progress').length,
      waitingOverThreshold: activeOrders.filter(
        (o) =>
          o.waitingOnKind !== null &&
          o.waitingOnKind !== 'none' &&
          o.waitingSince !== null &&
          o.waitingSince.getTime() < waitingCutoff.getTime()
      ).length,
      // Все этапы в статусе problem по активным заявкам (полный счётчик).
      problemStages: activeOrders.reduce(
        (acc, o) => acc + o.stages.filter((s) => s.status === 'problem').length,
        0
      ),
      attentionHours,
    }

    return NextResponse.json({
      generatedAt: now.toISOString(),
      stats,
      cargo: cargoRows.slice(0, PULSE_CARGO_LIMIT),
      cargoTotal: cargoRows.length,
      slowing,
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
