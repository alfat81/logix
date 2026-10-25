import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireEmployee } from '@/lib/auth'
import { apiErrorResponse } from '@/lib/api-errors'
import { logActivity, employeeActor } from '@/lib/activity'

type Params = { params: Promise<{ id: string; brokerId: string }> }

// ─── DELETE /api/admin/leads/[id]/brokers/[brokerId] — отключить (Д) ──
// Снимает связь «брокер консультирует расчёт». Оценка таможенных
// платежей (BrokerEstimate, 1:1 со связью) уходит каскадом вместе со
// связью — отключение = «консультация прекращена», полусвязь с
// осиротевшей оценкой не нужна (заявка ещё не создана; на won-лидах
// отключение запрещено, см. ниже).
//
// Лид в won/с заявкой — 409: связь уже перенесена в OrderBroker (В4),
// история расчёта зафиксирована; управлять видимостью исполнения
// нужно связью на заявке.
export async function DELETE(req: NextRequest, { params }: Params) {
  const auth = await requireEmployee(req, { write: true })
  if (!auth.ok) return auth.response

  const { id, brokerId } = await params
  try {
    const lead = await db.lead.findUnique({
      where: { id },
      select: { status: true, order: { select: { id: true } } },
    })
    if (!lead) {
      return NextResponse.json({ error: 'Запрос не найден' }, { status: 404 })
    }
    if (lead.status === 'won' || lead.order) {
      return NextResponse.json(
        { error: 'Запрос конвертирован в заявку — связь с брокером перенесена в заявку' },
        { status: 409 }
      )
    }

    const link = await db.leadBroker.findUnique({
      where: { leadId_brokerId: { leadId: id, brokerId } },
      include: { broker: { select: { id: true, companyName: true } } },
    })
    if (!link) {
      return NextResponse.json({ error: 'Брокер не подключён к этому запросу' }, { status: 404 })
    }

    await db.leadBroker.delete({ where: { id: link.id } })

    await logActivity(
      { leadId: id },
      employeeActor(auth.employee),
      'lead_broker_detached',
      `Отключён брокер: ${link.broker.companyName}`,
    )

    return NextResponse.json({ ok: true, message: `Брокер «${link.broker.companyName}» отключён` })
  } catch (e) {
    return apiErrorResponse(e, 'lead brokers DELETE', 'Не удалось отключить брокера')
  }
}
