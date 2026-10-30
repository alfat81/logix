import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireEmployee } from '@/lib/auth'
import { apiErrorResponse } from '@/lib/api-errors'
import { getSetting } from '@/lib/settings'
import { buildWaitingLong } from '@/lib/attention-waiting'

// ─── GET /api/admin/attention — экран «Требует внимания» (Ж5) ────
// Главная страница кабинета вместо дубля списка заявок. Правила
// (формулировки очереди — проверяемые):
//   1. просроченный этап — не завершён и плановая дата раньше сегодняшней;
//   2. этап в статусе «проблема»;
//   3. ближайший незавершённый этап активной заявки без исполнителя;
//   4. лид без изменений дольше 3 дней (Lead.updatedAt, Ж5);
//   5. письма с доставкой failed (DF-04) — только мастеру: журнал
//      отправок master-only, менеджеру счётчик не считается и не
//      отдаётся (null) — секция на экране не рендерится.
//
// Осознанные решения сессии (зафиксированы, чтобы не «всплывали»):
//   • «Активная заявка» = calculating | confirmed | in_progress.
//     Просрочка и проблема завершённой/отменённой сделки вниманием не
//     считаются: мёртвые сделки не должны вечно висеть на главном экране.
//   • «Сегодня» — по UTC: плановые даты приходят UTC-полночью
//     (T00:00:00.000Z из UI), таймзона сервера не сдвигает день —
//     тот же принцип, что в списках Ж4 и fmtRuDate (Ж2).
//   • Правило просрочки «план < сегодня UTC» — то же, что в списке
//     заявок Ж4: план на сегодня — не просрочка, просрочка с завтра.
//   • Порог простоя лида — 3 полных дня от updatedAt, без «граничных»
//     получудней.
//   • Секции отдаются лимитом (SECTION_LIMIT), счётчики — полные:
//     экран — сводка, работа — в карточках и списках.

// Активные статусы заявки (решение выше).
const ACTIVE_ORDER_STATUSES = ['calculating', 'confirmed', 'in_progress'] as const
// Активные статусы лида: won/lost — терминальные, «без движения»
// законченные лиды не интересуют.
const ACTIVE_LEAD_STATUSES = ['new', 'calculated'] as const

const STALE_LEAD_DAYS = 3
const DAY_MS = 24 * 60 * 60 * 1000
const SECTION_LIMIT = 20

type StageAttention = {
  orderId: string
  orderNumber: string
  orderStatus: string
  customerName: string
  stageName: string
  stageStatus: string
  plannedDate: string | null
  daysOverdue: number | null
  contractorName: string | null
}

type LeadAttention = {
  leadId: string
  status: string
  contactName: string
  daysIdle: number
  updatedAt: string
}

// DF-05: сделка, чей «мяч» висит дольше порога (настройка
// waiting.attention_hours) — сборка списка (тип WaitingLongAttention
// и правила попадания, включая D45-эскалацию по рабочим дням) — в
// lib/attention-waiting.ts (вынесено ради лимита 300 строк, RULES 2.14).

function daysBetween(from: number, to: number): number {
  return Math.floor((to - from) / DAY_MS)
}

export async function GET(req: NextRequest) {
  const auth = await requireEmployee(req)
  if (!auth.ok) return auth.response

  try {
    const now = new Date()
    const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
    const staleCutoff = new Date(now.getTime() - STALE_LEAD_DAYS * DAY_MS)
    // DF-05: порог секции «Ждут дольше N часов» — из реестра настроек
    // (DF-00D, ключ waiting.attention_hours — предзарегистрирован там).
    const attentionHours = await getSetting('waiting.attention_hours')
    const waitingCutoff = new Date(now.getTime() - attentionHours * 60 * 60 * 1000)
    // D45: SQL-предфильтр для «не выбран расчёт 2 рабочих дня».
    // Минимальный реальный интервал до эскалации — 24 ч 1 мин
    // (якорь в 23:59 МСК среды → порога в 00:00 МСК пятницы),
    // поэтому срез 24 ч заведомо шире точного JS-фильтра ниже.
    const choiceCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000)

    const [activeOrders, staleLeadRows, catalog, longOrders, longLeads] = await Promise.all([
      // Этапы в заявке — единицы, отдельные aggregate-запросы на каждую
      // категорию дороже одного прохода по заявкам в JS (тот же размен,
      // что в списке Ж4). MVP-масштаб: сотни заявок — копейки.
      db.order.findMany({
        where: { status: { in: [...ACTIVE_ORDER_STATUSES] } },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          number: true,
          status: true,
          customer: { select: { name: true } },
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
      db.lead.findMany({
        where: {
          status: { in: [...ACTIVE_LEAD_STATUSES] },
          updatedAt: { lt: staleCutoff },
        },
        orderBy: { updatedAt: 'asc' },
        select: {
          id: true,
          status: true,
          updatedAt: true,
          customer: { select: { name: true } },
          rawContact: true,
        },
      }),
      db.orderStageCatalog.findMany({ select: { code: true, name: true } }),
      // DF-05 «Ждут дольше N часов»: kind != none и waitingSince старше
      // порога. NULL waitingSince (ещё не пересчитано) отсекается самим
      // сравнением < (SQL: NULL < x → NULL → строка не проходит).
      db.order.findMany({
        where: {
          status: { in: [...ACTIVE_ORDER_STATUSES] },
          waitingOnKind: { notIn: ['none'] },
          waitingSince: { lt: waitingCutoff },
        },
        orderBy: { waitingSince: 'asc' },
        select: {
          id: true,
          number: true,
          status: true,
          customer: { select: { name: true } },
          waitingOnKind: true,
          waitingSince: true,
        },
      }),
      db.lead.findMany({
        where: {
          status: { in: [...ACTIVE_LEAD_STATUSES] },
          OR: [
            { waitingOnKind: { notIn: ['none'] }, waitingSince: { lt: waitingCutoff } },
            // D45: «не выбран расчёт» попадает в внимание по РАБОЧИМ
            // дням, не по общему порогу часов — точный фильтр в JS.
            {
              waitingReason: 'awaiting_client_choice',
              waitingSince: { lt: choiceCutoff },
            },
          ],
        },
        orderBy: { waitingSince: 'asc' },
        select: {
          id: true,
          status: true,
          customer: { select: { name: true } },
          rawContact: true,
          waitingOnKind: true,
          waitingReason: true,
          waitingSince: true,
        },
      }),
    ])

    const stageNames = new Map(catalog.map((c) => [c.code, c.name]))

    const overdueStages: StageAttention[] = []
    const problemStages: StageAttention[] = []
    const unassignedStages: StageAttention[] = []

    for (const order of activeOrders) {
      const incomplete = order.stages.filter((s) => s.status !== 'done')

      // Ближайший этап — первый незавершённый по порядку (включая
      // «проблему» — определение Ж4, там же рождены эти колонки).
      const nearest = incomplete[0] ?? null

      for (const stage of incomplete) {
        const base = {
          orderId: order.id,
          orderNumber: order.number,
          orderStatus: order.status,
          customerName: order.customer.name,
          stageName: stageNames.get(stage.stageCode) ?? stage.stageCode,
          stageStatus: stage.status,
          plannedDate: stage.plannedDate ? stage.plannedDate.toISOString() : null,
          contractorName: stage.contractor?.companyName ?? null,
        }

        // 1. Просрочка: план есть и раньше сегодняшней UTC-полуночи.
        if (stage.plannedDate && stage.plannedDate.getTime() < todayUtc) {
          overdueStages.push({
            ...base,
            daysOverdue: daysBetween(stage.plannedDate.getTime(), todayUtc),
          })
        }

        // 2. Проблема — любой этап заявки в статусе problem.
        if (stage.status === 'problem') {
          problemStages.push({ ...base, daysOverdue: null })
        }

        // 3. Без исполнителя — только БЛИЖАЙШИЙ этап (дальние очередью
        //    не считаются: исполнителей назначают по порядку движения,
        //    а не на всю заявку разом).
        if (nearest === stage && !stage.contractor) {
          unassignedStages.push({ ...base, daysOverdue: null })
        }
      }
    }

    // Самые давние просрочки — сверху (горят сильнее всех); проблемы и
    // неназначенные — в порядке заявок (старейшие первыми).
    overdueStages.sort((a, b) => (a.plannedDate ?? '').localeCompare(b.plannedDate ?? ''))

    const staleLeads: LeadAttention[] = staleLeadRows.map((l) => ({
      leadId: l.id,
      status: l.status,
      contactName:
        l.customer?.name ??
        (l.rawContact && typeof l.rawContact === 'object' && !Array.isArray(l.rawContact)
          ? String((l.rawContact as { name?: unknown }).name ?? '—')
          : '—'),
      daysIdle: daysBetween(l.updatedAt.getTime(), now.getTime()),
      updatedAt: l.updatedAt.toISOString(),
    }))

    // DF-05: единый список «Ждут дольше N часов» — заявки и запросы
    // вместе, самые давние сверху; фильтр D45 (≥2 рабочих дня) и
    // флаг followup — внутри buildWaitingLong.
    const waitingLong = buildWaitingLong(longOrders, longLeads, waitingCutoff, now)

    // DF-04: failed-письма в внимании — только мастеру (журнал
    // master-only; не-мастеру null — поле отсутствует по смыслу прав).
    const notificationsFailed = auth.employee.roles.includes('master')
      ? await db.notification.count({ where: { status: 'failed' } })
      : null

    return NextResponse.json({
      generatedAt: now.toISOString(),
      // Срезы — лимитом, счётчики — полные: «и ещё N» в UI ведёт в списки.
      overdueStages: overdueStages.slice(0, SECTION_LIMIT),
      problemStages: problemStages.slice(0, SECTION_LIMIT),
      unassignedStages: unassignedStages.slice(0, SECTION_LIMIT),
      staleLeads: staleLeads.slice(0, SECTION_LIMIT),
      waitingLong: waitingLong.slice(0, SECTION_LIMIT),
      counts: {
        overdue: overdueStages.length,
        problem: problemStages.length,
        unassigned: unassignedStages.length,
        staleLeads: staleLeads.length,
        waitingLong: waitingLong.length,
      },
      // Порог секции — для подписи в UI («Ждут дольше N часов»).
      attentionHours,
      notificationsFailed,
    })
  } catch (e) {
    return apiErrorResponse(e, 'attention GET', 'Не удалось загрузить сводку внимания')
  }
}
