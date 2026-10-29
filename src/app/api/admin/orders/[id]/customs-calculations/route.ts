import { NextRequest, NextResponse } from 'next/server'
import { requireEmployee } from '@/lib/auth'
import { db } from '@/lib/db'
import { apiErrorResponse } from '@/lib/api-errors'
import { calcErrorResponse, calculationsListResponse, requireCalcWriter } from '@/lib/customs-api'
import { createCalculation } from '@/lib/customs-server'

type Params = { params: Promise<{ id: string }> }

// ─── DF-19: расчёты таможенных платежей ЗАЯВКИ ───────────────────────
// GET — история версий, POST — новый расчёт (пересчёт = новая версия).
// Только сотрудники (D38; e2e: клиент и брокер расчёт не видят).
// Отменённая заявка — 409 (расчёт закрыт вместе со сделкой).
// Разбор тела и маппинг ошибок — общий хвост lib/customs-api.ts.

export async function GET(req: NextRequest, { params }: Params) {
  const auth = await requireEmployee(req)
  if (!auth.ok) return auth.response
  const { id } = await params
  try {
    return await calculationsListResponse(id, 'order')
  } catch (e) {
    return apiErrorResponse(e, 'order customs-calculations GET', 'Не удалось загрузить расчёты')
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  const ctx = await requireCalcWriter(req, params)
  if (ctx.response) return ctx.response
  try {
    const order = await db.order.findUnique({ where: { id: ctx.id }, select: { id: true, status: true } })
    if (!order) return NextResponse.json({ error: 'Заявка не найдена' }, { status: 404 })
    if (order.status === 'cancelled') {
      return NextResponse.json({ error: 'Заявка отменена — расчёт недоступен' }, { status: 409 })
    }
    const calculation = await createCalculation({
      orderId: ctx.id,
      input: ctx.input,
      employee: ctx.employee,
    })
    return NextResponse.json({ calculation }, { status: 201 })
  } catch (e) {
    return calcErrorResponse(e, 'order customs-calculations POST', 'Не удалось сохранить расчёт')
  }
}
