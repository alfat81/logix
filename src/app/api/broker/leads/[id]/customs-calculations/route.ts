import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireBroker } from '@/lib/broker-auth'
import { apiErrorResponse } from '@/lib/api-errors'
import { listCalculations } from '@/lib/customs-server'

type Params = { params: Promise<{ id: string }> }

// GET /api/broker/leads/[id]/customs-calculations — история таможенных
// расчётов запроса для ПОДКЛЮЧЁННОГО брокера (DF-27 волна 2, Р-5/D75:
// «полную историю показывать менеджеру и брокеру в рамках прав»).
// Скоупинг — только сделки, где брокер привязан (LeadBroker; чужой
// запрос — 404). Расчёты не содержат себестоимости и маржи (D3);
// варианты расчёта брокеру не открываются (§10.5 техплана).
export async function GET(req: NextRequest, { params }: Params) {
  const auth = await requireBroker(req)
  if (!auth.ok) return auth.response

  const { id } = await params
  try {
    const link = await db.leadBroker.findUnique({
      where: { leadId_brokerId: { leadId: id, brokerId: auth.broker.id } },
      select: { id: true },
    })
    if (!link) {
      return NextResponse.json({ error: 'Запрос не найден' }, { status: 404 })
    }
    const calculations = await listCalculations({ leadId: id })
    return NextResponse.json({ calculations })
  } catch (e) {
    return apiErrorResponse(e, 'broker customs GET', 'Не удалось загрузить расчёты')
  }
}
