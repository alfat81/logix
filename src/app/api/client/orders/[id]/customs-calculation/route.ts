import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireClient } from '@/lib/client-auth'
import { apiErrorResponse } from '@/lib/api-errors'
import { ownOrderOr404 } from '@/lib/client-scope'
import { projectCustomsResult, CLIENT_CURRENT_CALC_SELECT } from '@/lib/client-customs-view'

type Params = { params: Promise<{ id: string }> }

// ─── DF-27 волна 2 (Р-5, D75): клиент видит только АКТУАЛЬНЫЙ результат ──
// GET /api/client/orders/[id]/customs-calculation — текущая версия
// таможенного расчёта СВОЕЙ заявки (в т.ч. перенесённая при конвертации
// с origin='carried_from_lead') + блок «Окончательные платежи по ДТ»,
// если записи внесены. История версий и пересчётов клиенту НЕ отдаётся;
// чужая заявка — 404.
export async function GET(req: NextRequest, { params }: Params) {
  const auth = await requireClient(req)
  if (!auth.ok) return auth.response

  const { id } = await params
  try {
    const order = await ownOrderOr404(db, id, auth.client.id)
    if (!order) {
      return NextResponse.json({ error: 'Заявка не найдена' }, { status: 404 })
    }
    const calc = await db.customsCalculation.findFirst({
      where: { orderId: id, isCurrent: true },
      orderBy: { createdAt: 'desc' },
      select: CLIENT_CURRENT_CALC_SELECT,
    })
    // Окончательные платежи по ДТ — только факт последней записи (Р-5:
    // клиенту показывается актуальный результат без журнала); записи —
    // append-only (внесение — сотрудник, D73 §8.6)
    const finalPayment = await db.customsFinalPayment.findFirst({
      where: { orderId: id },
      orderBy: [{ dtDate: 'desc' }, { createdAt: 'desc' }],
      select: { dtDate: true, lines: true, note: true },
    })
    if (!calc && !finalPayment) {
      return NextResponse.json(projectCustomsResult(null, null))
    }
    return NextResponse.json(
      projectCustomsResult(
        calc,
        finalPayment
          ? { dtDate: finalPayment.dtDate, lines: finalPayment.lines, note: finalPayment.note }
          : null
      )
    )
  } catch (e) {
    return apiErrorResponse(e, 'client order customs GET', 'Не удалось загрузить расчёт')
  }
}
