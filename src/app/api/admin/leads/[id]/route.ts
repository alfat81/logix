import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireEmployee } from '@/lib/auth'
import { apiErrorResponse } from '@/lib/api-errors'
import {
  ACTIVITY_PUBLIC_FIELDS,
  ACTIVITY_FEED_TAKE,
} from '@/lib/activity'
import { eventWhereFor } from '@/lib/audience'
import { projectActors, STAFF_READER } from '@/lib/actor-name'
import { PERMIT_FIELDS } from '@/lib/permits-db'
import { patchLead } from './patch'
import { completeness, diffOptionVsLead } from '@/lib/option-snapshots'
import { sumOptionCalc } from '@/lib/option-calc'

type Params = { params: Promise<{ id: string }> }

// v0.5.0 (P1-22): PATCH — выезд в соседний patch.ts (резка под лимит
// 300, RULES 2.14); здесь GET-карточка и DELETE.

// ─── GET /api/admin/leads/[id] — карточка запроса ─────────────
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
        options: {
          orderBy: { createdAt: 'asc' },
          include: { calcLines: { orderBy: { sortOrder: 'asc' } } },
        },
        order: { select: { id: true, number: true, status: true } },
        // DF-27 волна 2 (Р-3): история снимков согласования v2 — staff
        // (клиенту отдаётся только активный снимок, клиентский роут)
        approvalSnapshots: { orderBy: { confirmedAt: 'desc' } },
        // Д: брокеры расчёта с оценками (таможенные платежи +
        // разрешительные документы) — оценка на связи, 1:1
        brokers: {
          orderBy: { createdAt: 'asc' },
          include: {
            broker: { select: { id: true, companyName: true, phone: true, isActive: true, isInHouse: true } },
            // DF-18: со строками кодов ТН ВЭД — таблица в BrokerLinksSection
            estimate: { include: { items: { orderBy: { sortOrder: 'asc' } } } },
          },
        },
        // Ж2: лента событий — свежие сверху, окно ACTIVITY_FEED_TAKE.
        // DF-01: фильтр аудитории — только через eventWhereFor (§1.3);
        // для staff это пустой фрагмент.
        activities: {
          where: eventWhereFor('staff'),
          orderBy: { createdAt: 'desc' },
          take: ACTIVITY_FEED_TAKE,
          select: ACTIVITY_PUBLIC_FIELDS,
        },
        // DF-16: разрешительные запроса (полная проекция — сотруднику).
        permitRequirements: {
          orderBy: [{ isBlocking: 'desc' }, { createdAt: 'asc' } as const],
          select: PERMIT_FIELDS,
        },
      },
    })
    if (!lead) {
      return NextResponse.json({ error: 'Запрос не найден' }, { status: 404 })
    }

    // DF-02A (Блок 4): актёр-человек собирается при чтении — сотруднику
    // «Имя (Компания)» (устаревшие строки — компания, как было).
    const activities = await projectActors(lead.activities, STAFF_READER)
    // DF-27 волна 1 (план §9): staff-проекция вариантов — итоги расчёта
    // и расхождение с запросом по каждому варианту; индикатор готовности
    // запроса к расчёту (ТЗ §2.3 — вычисляемый, не хранимое поле).
    const leadBlank = {
      cargoInfo: lead.cargoInfo,
      wishes: lead.wishes,
      originCity: lead.originCity,
      originCountry: lead.originCountry,
      originCountryCode: lead.originCountryCode,
      destinationCity: lead.destinationCity,
      destinationCountry: lead.destinationCountry,
      destinationCountryCode: lead.destinationCountryCode,
      transportType: lead.transportType,
      readyDate: lead.readyDate,
      // Метрики маршрута — completeness читает вес/объём/места с колонок
      // (e2e DF-27 сц.2: пропуск давал вечное «Вес или объём»/«Количество
      // мест» в карточке при полном наборе данных).
      weightKg: lead.weightKg,
      volumeM3: lead.volumeM3,
      placesCount: lead.placesCount,
      incotermCode: lead.incotermCode,
      incotermPlace: lead.incotermPlace,
    }
    const options = lead.options.map((o) => ({
      ...o,
      calcTotals: o.calcLines.length > 0 ? sumOptionCalc(o.calcLines, o.currency) : null,
      diffFromLead: diffOptionVsLead(leadBlank, o),
    }))
    return NextResponse.json({
      lead: {
        ...lead,
        options,
        completeness: completeness(leadBlank),
        activities,
      },
    })
  } catch (e) {
    return apiErrorResponse(e, 'lead GET', 'Не удалось загрузить запрос')
  }
}

// ─── PATCH /api/admin/leads/[id] — статус/ответственный/анкета ────
export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await requireEmployee(req, { write: true })
  if (!auth.ok) return auth.response

  const { id } = await params
  return patchLead(req, id, auth)
}

// ─── DELETE /api/admin/leads/[id] — удалить запрос ────────────
// Только для запросов БЕЗ заявки: конвертированный (won, В4) — уже
// история воронки, его удаление разорвёт связь Order.leadId, поэтому 409.
// Варианты расчёта (QuoteOption) уходят каскадом вместе с лидом
// (onDelete: Cascade в схеме В1).
export async function DELETE(req: NextRequest, { params }: Params) {
  // P1-09 / DF-00: удаление лидов — только мастер
  const auth = await requireEmployee(req, { roles: ['master'], write: true })
  if (!auth.ok) return auth.response

  const { id } = await params
  try {
    const lead = await db.lead.findUnique({
      where: { id },
      include: { order: { select: { id: true } } },
    })
    if (!lead) {
      return NextResponse.json({ error: 'Запрос не найден' }, { status: 404 })
    }
    if (lead.order) {
      return NextResponse.json(
        { error: 'Нельзя удалить запрос, конвертированный в заявку' },
        { status: 409 }
      )
    }

    await db.lead.delete({ where: { id } })
    return NextResponse.json({ ok: true, message: 'Запрос удалён' })
  } catch (e) {
    return apiErrorResponse(e, 'lead DELETE', 'Не удалось удалить запрос')
  }
}
