import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireClient } from '@/lib/client-auth'
import { apiErrorResponse } from '@/lib/api-errors'
import { ownLeadOr404 } from '@/lib/client-scope'
import { projectCustomsResult, CLIENT_CURRENT_CALC_SELECT } from '@/lib/client-customs-view'

type Params = { params: Promise<{ id: string }> }

// ─── DF-27 волна 2 (Р-5, D75): клиент видит только АКТУАЛЬНЫЙ результат ──
// GET /api/client/leads/[id]/customs-calculation — текущая версия
// таможенного расчёта СВОЕГО запроса, белый список полей (позиции:
// коды/ставки/характеристики + суммы с подписью D41 в UI). История
// версий и внутренних правок клиенту НЕ отдаётся (её видят только
// менеджер и брокер); чужой запрос — 404.
export async function GET(req: NextRequest, { params }: Params) {
  const auth = await requireClient(req)
  if (!auth.ok) return auth.response

  const { id } = await params
  try {
    const lead = await ownLeadOr404(db, id, auth.client.id)
    if (!lead) {
      return NextResponse.json({ error: 'Запрос не найден' }, { status: 404 })
    }
    const calc = await db.customsCalculation.findFirst({
      where: { leadId: id, isCurrent: true },
      orderBy: { createdAt: 'desc' },
      select: CLIENT_CURRENT_CALC_SELECT,
    })
    if (!calc) {
      return NextResponse.json(projectCustomsResult(null, null))
    }
    return NextResponse.json(projectCustomsResult(calc, null))
  } catch (e) {
    return apiErrorResponse(e, 'client customs GET', 'Не удалось загрузить расчёт')
  }
}
