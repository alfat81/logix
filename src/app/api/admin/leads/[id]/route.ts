import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireEmployee } from '@/lib/auth'
import { apiErrorResponse } from '@/lib/api-errors'
import {
  ACTIVITY_PUBLIC_FIELDS,
  ACTIVITY_FEED_TAKE,
} from '@/lib/activity'
import { patchLead } from './patch'

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
      return NextResponse.json({ error: 'Запрос не найден' }, { status: 404 })
    }

    return NextResponse.json({ lead })
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
