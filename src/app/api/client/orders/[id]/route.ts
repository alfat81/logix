import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireClient } from '@/lib/client-auth'
import { apiErrorResponse } from '@/lib/api-errors'

type Params = { params: Promise<{ id: string }> }

// ─── GET /api/client/orders/[id] — карточка заявки клиента (И1) ───
// Состав — зеркало списка (решение вопроса №1): номер, статус, анкета
// груза и ВСЕ этапы со статусами и датами (клиенту нужен контекст
// всей цепочки — что уже пройдено, что впереди). Без подрядчиков,
// без ставок, без условий сделки. Чужая заявка — 404, а не 403:
// факт существования чужой сделки не раскрываем (единообразно с
// кабинетом подрядчика, Г4).
export async function GET(req: NextRequest, { params }: Params) {
  const auth = await requireClient(req)
  if (!auth.ok) return auth.response

  const { id } = await params
  try {
    const order = await db.order.findFirst({
      where: { id, customerId: auth.client.id },
      select: {
        id: true,
        number: true,
        status: true,
        createdAt: true,
        cargoInfo: true,
        stages: {
          orderBy: { sequence: 'asc' },
          select: {
            id: true,
            stageCode: true,
            sequence: true,
            status: true,
            plannedDate: true,
            actualDate: true,
          },
        },
      },
    })
    if (!order) {
      return NextResponse.json({ error: 'Заявка не найдена' }, { status: 404 })
    }

    const catalog = await db.orderStageCatalog.findMany({ select: { code: true, name: true } })
    const nameByCode = new Map(catalog.map((c) => [c.code, c.name]))

    return NextResponse.json({
      order: {
        ...order,
        stages: order.stages.map((s) => ({
          id: s.id,
          name: nameByCode.get(s.stageCode) ?? s.stageCode,
          sequence: s.sequence,
          status: s.status,
          plannedDate: s.plannedDate,
          actualDate: s.actualDate,
        })),
      },
    })
  } catch (e) {
    return apiErrorResponse(e, 'client/order GET', 'Не удалось загрузить заявку')
  }
}
