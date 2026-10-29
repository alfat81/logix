import { NextRequest, NextResponse } from 'next/server'
import { requireEmployee } from '@/lib/auth'
import { db } from '@/lib/db'
import { apiErrorResponse } from '@/lib/api-errors'
import { calcErrorResponse, calculationsListResponse, requireCalcWriter } from '@/lib/customs-api'
import { createCalculation } from '@/lib/customs-server'

type Params = { params: Promise<{ id: string }> }

// ─── DF-19: расчёты таможенных платежей ЗАПРОСА ──────────────────────
// GET — история версий (текущая сверху), POST — новый расчёт (пересчёт
// создаёт новую версию, прежняя остаётся в истории). Только сотрудники:
// проценты брокера и платежи — внутренняя кухня (D38), клиенту расчёт
// не виден; брокеру — тоже (его лента не показывает чужих расчётов).
// Лид в won — 409: сделка уехала в заявку, расчёты ведутся на заявке
// (история на лиде остаётся читаемой). lost — расчёт закрыт (409).
// Разбор тела и маппинг ошибок — общий хвост lib/customs-api.ts.

export async function GET(req: NextRequest, { params }: Params) {
  const auth = await requireEmployee(req)
  if (!auth.ok) return auth.response
  const { id } = await params
  try {
    return await calculationsListResponse(id, 'lead')
  } catch (e) {
    return apiErrorResponse(e, 'lead customs-calculations GET', 'Не удалось загрузить расчёты')
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  const ctx = await requireCalcWriter(req, params)
  if (ctx.response) return ctx.response
  try {
    const lead = await db.lead.findUnique({
      where: { id: ctx.id },
      select: { id: true, status: true, order: { select: { id: true } } },
    })
    if (!lead) return NextResponse.json({ error: 'Запрос не найден' }, { status: 404 })
    if (lead.status === 'won' || lead.order) {
      return NextResponse.json(
        { error: 'Запрос конвертирован в заявку — считайте платежи на заявке' },
        { status: 409 }
      )
    }
    if (lead.status === 'lost') {
      return NextResponse.json({ error: 'Запрос закрыт как отказ — расчёт недоступен' }, { status: 409 })
    }
    const calculation = await createCalculation({
      leadId: ctx.id,
      input: ctx.input,
      employee: ctx.employee,
    })
    return NextResponse.json({ calculation }, { status: 201 })
  } catch (e) {
    return calcErrorResponse(e, 'lead customs-calculations POST', 'Не удалось сохранить расчёт')
  }
}
