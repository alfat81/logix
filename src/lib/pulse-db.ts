import { db } from '@/lib/db'
import { getSetting } from '@/lib/settings'
import { todayUtcMidnight } from '@/lib/order-summary'
import { nearestUnfinishedStage } from '@/lib/waiting'
import { resolveDocumentKind, type DocumentKind } from '@/lib/document-constants'
import { missingKinds } from '@/lib/stage-doc-requirements'
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

  const [newLeads24h, activeOrders, catalog, blockingReqs, blockingPermits, submittedPermits] = await Promise.all([
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
            sequence: true,
            status: true,
            contractorId: true,
            plannedDate: true,
            contractor: { select: { companyName: true } },
          },
        },
        // DF-14: финальные документы — виды для счётчика
        // missingFinalDocs (та же семантика, что у правила 8).
        documents: {
          where: { status: 'final' },
          select: { kind: true, type: true, isInternal: true },
        },
      },
    }),
    db.orderStageCatalog.findMany({ select: { code: true, name: true } }),
    // DF-14: блокирующие требования — таблица маленькая (чек-лист
    // настраивается вручную), берём целиком один запрос и группируем
    // по этапу в JS.
    db.stageDocumentRequirement.findMany({
      where: { isBlocking: true },
      select: { stageCode: true, kind: true },
    }),
    // DF-26 волна 2 (§11.3): блокирующие требования этапов (stageCode) —
    // дополнение счётчика missingFinalDocs; таблица маленькая, берём
    // целиком и фильтруем в JS по ближайшим этапам активных заявок.
    db.permitRequirement.findMany({
      where: {
        orderId: { not: null },
        isBlocking: true,
        stageCode: { not: null },
        status: { in: ['pending', 'submitted'] },
      },
      select: { orderId: true, stageCode: true, status: true },
    }),
    // «Документов ждут проверки» — submitted одним числом (§11.3).
    db.permitRequirement.count({ where: { status: 'submitted' } }),
  ])

  const stageNames = new Map(catalog.map((c) => [c.code, c.name]))
  const cargo = activeOrders.map((o) => buildCargoRow(o, stageNames, todayUtc))
  const slowing = groupSlowingOrders(activeOrders, PULSE_SLOWING_GROUP_LIMIT)

  // DF-14: число активных заявок, у ближайшего этапа которых есть
  // блокирующее требование без финального документа этого вида на
  // заявке. Тот же missingKinds, что у правила 8 «у кого мяч» — цифры
  // Пульса и мячи не расходятся. Требования группируются по этапу один
  // раз (таблица маленькая).
  const blockingByStage = new Map<string, Array<{ kind: DocumentKind; isBlocking: boolean }>>()
  for (const r of blockingReqs) {
    const list = blockingByStage.get(r.stageCode) ?? []
    list.push({ kind: r.kind as DocumentKind, isBlocking: true })
    blockingByStage.set(r.stageCode, list)
  }
  // DF-26 волна 2 (§11.3): блокирующие требования этапов — та же
  // семантика «ближайший этап не закрыт»: pending (нет документа) ИЛИ
  // submitted (документ ждёт решения сотрудника) считаются недостающими.
  const blockingPermitsByStage = new Map<string, Set<string>>()
  const orderIds = new Set(activeOrders.map((o) => o.id))
  for (const p of blockingPermits) {
    if (!p.orderId || !orderIds.has(p.orderId)) continue
    const set = blockingPermitsByStage.get(p.stageCode as string) ?? new Set()
    set.add(p.orderId)
    blockingPermitsByStage.set(p.stageCode as string, set)
  }
  const missingFinalDocs = activeOrders.filter((o) => {
    const nearest = nearestUnfinishedStage(o.stages)
    if (!nearest) return false
    const reqs = blockingByStage.get(nearest.stageCode)
    const finals = o.documents.map((d) => resolveDocumentKind(d))
    const docMissing = reqs && reqs.length > 0 && missingKinds(reqs, finals).length > 0
    const permitBlocks = blockingPermitsByStage.get(nearest.stageCode)?.has(o.id) ?? false
    return docMissing || permitBlocks
  }).length

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
    missingFinalDocs,
    submittedPermits,
    attentionHours,
  }

  return { stats, cargo, cargoTotal: cargo.length, slowing }
}
