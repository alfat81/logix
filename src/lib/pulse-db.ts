import { db } from '@/lib/db'
import { getSetting } from '@/lib/settings'
import { todayUtcMidnight } from '@/lib/order-summary'
import {
  buildCargoRow,
  groupSlowingOrders,
  PULSE_EVENT_WINDOW_HOURS,
  PULSE_SLOWING_GROUP_LIMIT,
  type PulseCargoRow,
  type PulseStats,
  type SlowingGroup,
} from '@/lib/pulse'

// ─── DF-07/DF-08: серверная сборка блоков 1–3 «Пульса» ───────────────
// Единственная точка выборки цифр и групп «Кто тормозит»: её используют
// GET /api/admin/pulse (экран, DF-07) и сводка владельцу (DF-08, письмо
// `type=digest`) — числа письма и экрана сходятся ПО ПОСТРОЕНИЮ (одна
// выборка, одна семантика), а не повторным SQL. События (блок 4) —
// забота экрана (в письме их нет по карточке DF-08).
//
// Round-trip'ы — один на совокупность блоков: цифры, «Где груз» и
// «Кто тормозит» считаются из ОДНОЙ выборки активных заявок с этапами
// (MVP-масштаб: сотни заявок — копейки, замер v0.7.5 — 20 мс на +200).
export type PulseCore = {
  stats: PulseStats
  cargo: PulseCargoRow[]
  cargoTotal: number
  slowing: SlowingGroup[]
}

export async function loadPulseCore(at: Date = new Date()): Promise<PulseCore> {
  const dayMs = 24 * 60 * 60 * 1000
  // DF-05: порог «ждут дольше N часов» — настройка waiting.attention_hours.
  const attentionHours = await getSetting('waiting.attention_hours')
  const waitingCutoff = new Date(at.getTime() - attentionHours * 60 * 60 * 1000)
  const todayUtc = todayUtcMidnight()

  const [newLeads24h, activeOrders, catalog] = await Promise.all([
    // Блок 1: новые запросы за 24 ч (поток входа, включая ушедшие
    // в won/lost за сутки — считаем вход, не активный портфель).
    db.lead.count({ where: { createdAt: { gte: new Date(at.getTime() - PULSE_EVENT_WINDOW_HOURS * dayMs) } } }),
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
  ])

  const stageNames = new Map(catalog.map((c) => [c.code, c.name]))
  const cargo = activeOrders.map((o) => buildCargoRow(o, stageNames, todayUtc))
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

  return { stats, cargo, cargoTotal: cargo.length, slowing }
}
