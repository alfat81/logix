import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireBroker } from '@/lib/broker-auth'
import { apiErrorResponse } from '@/lib/api-errors'
import { listCalculations } from '@/lib/customs-server'

type Params = { params: Promise<{ id: string }> }

// GET /api/broker/orders/[id]/customs-calculations — история таможенных
// расчётов заявки для ПОДКЛЮЧЁННОГО брокера (DF-27 волна 2, Р-5/D75:
// история, перенесённая при конвертации с origin='carried_from_lead',
// видна брокеру; чужая заявка — 404). Расчёты не содержат себестоимости
// и маржи (D3); варианты расчёта брокеру не открываются (§10.5).
export async function GET(req: NextRequest, { params }: Params) {
  const auth = await requireBroker(req)
  if (!auth.ok) return auth.response

  const { id } = await params
  try {
    const order = await db.order.findFirst({
      where: { id, brokers: { some: { brokerId: auth.broker.id } } },
      select: { id: true },
    })
    if (!order) {
      return NextResponse.json({ error: 'Заявка не найдена' }, { status: 404 })
    }
    const calculations = await listCalculations({ orderId: id })
    return NextResponse.json({ calculations })
  } catch (e) {
    return apiErrorResponse(e, 'broker order customs GET', 'Не удалось загрузить расчёты')
  }
}
