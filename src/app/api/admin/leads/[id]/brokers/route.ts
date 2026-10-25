import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireEmployee } from '@/lib/auth'
import { apiErrorResponse } from '@/lib/api-errors'
import { logActivity, employeeActor } from '@/lib/activity'
import { BROKER_PUBLIC_FIELDS } from '@/lib/brokers'

type Params = { params: Promise<{ id: string }> }

// ─── POST /api/admin/leads/[id]/brokers — подключить брокера (Д) ──
// Брокер консультирует сделку с этапа расчёта (роадмап 5а): связь на
// уровне лида, видимость — лид целиком (анкета груза) и затем заявка
// после конвертации (перенос связей — В4). Несколько брокеров на
// сделке допустимы (разные юрисдикции экспорт/импорт) — у каждого
// полная видимость.
//
// Права: любой сотрудник на запись (подключение участника — часть
// ведения сделки, как назначение подрядчика Г3; мастер-only не нужен).
// Деактивированный брокер — 409 (новые подключения закрыты, паттерн
// «исключён из пула» Г3). Лид в won/с заявкой — 409: сделка уехала в
// исполнение, подключайте к заявке (там своя связь).
const AttachBrokerSchema = z.object({
  brokerId: z.string().min(1, 'Выберите брокера'),
})

export async function POST(req: NextRequest, { params }: Params) {
  const auth = await requireEmployee(req, { write: true })
  if (!auth.ok) return auth.response

  const { id } = await params
  try {
    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Некорректный JSON в теле запроса' }, { status: 400 })
    }
    const parsed = AttachBrokerSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Некорректные данные', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const lead = await db.lead.findUnique({
      where: { id },
      select: { id: true, status: true, order: { select: { id: true } } },
    })
    if (!lead) {
      return NextResponse.json({ error: 'Запрос не найден' }, { status: 404 })
    }
    // Симметрия с вариантами расчёта (В3): won — терминальный, лид
    // с заявкой — уже история сделки; подключение к расчёту, которого
    // больше нет, — ошибка сценария, а не тишина.
    if (lead.status === 'won' || lead.order) {
      return NextResponse.json(
        { error: 'Запрос конвертирован в заявку — подключайте брокера к заявке' },
        { status: 409 }
      )
    }

    const broker = await db.broker.findUnique({
      where: { id: parsed.data.brokerId },
      select: { ...BROKER_PUBLIC_FIELDS },
    })
    if (!broker) {
      return NextResponse.json({ error: 'Брокер не найден' }, { status: 404 })
    }
    if (!broker.isActive) {
      return NextResponse.json(
        { error: `Брокер «${broker.companyName}» деактивирован — новые подключения закрыты` },
        { status: 409 }
      )
    }

    const duplicate = await db.leadBroker.findUnique({
      where: { leadId_brokerId: { leadId: id, brokerId: broker.id } },
      select: { id: true },
    })
    if (duplicate) {
      return NextResponse.json(
        { error: `Брокер «${broker.companyName}» уже подключён к этому запросу` },
        { status: 409 }
      )
    }

    const link = await db.leadBroker.create({
      data: { leadId: id, brokerId: broker.id },
      include: {
        broker: { select: BROKER_PUBLIC_FIELDS },
        estimate: true,
      },
    })

    await logActivity(
      { leadId: id },
      employeeActor(auth.employee),
      'lead_broker_attached',
      `Подключён брокер: ${broker.companyName}`,
    )

    return NextResponse.json({ link }, { status: 201 })
  } catch (e) {
    return apiErrorResponse(e, 'lead brokers POST', 'Не удалось подключить брокера')
  }
}
