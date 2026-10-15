import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireClient } from '@/lib/client-auth'
import { apiErrorResponse } from '@/lib/api-errors'

// ─── GET /api/client/orders — заявки клиента (И1, только чтение) ──
// Все заявки клиента (customerId = я), свежие сверху. Состав — по
// решению вопроса №1 (14.10.2026): этапы и статусы, БЕЗ подрядчиков,
// БЕЗ ставок и БЕЗ условий сделки (quoteSnapshot, инкотермс — к
// кабинету придут вместе с решением по ценообразованию). cargoInfo —
// собственная анкета клиента, её показывать можно и нужно.
//
// Без пагинации — образец кабинета подрядчика (Г4): у клиента
// единицы активных сделок, а история на годы вперёд получит свой
// экран, когда появится поиск (паттерн Ж4).
export async function GET(req: NextRequest) {
  const auth = await requireClient(req)
  if (!auth.ok) return auth.response

  try {
    // Имя этапа — живой lookup по каталогу (паттерн Г4): stageCode —
    // служебный код, человеку нужно название.
    const catalog = await db.orderStageCatalog.findMany({ select: { code: true, name: true } })
    const nameByCode = new Map(catalog.map((c) => [c.code, c.name]))

    const orders = await db.order.findMany({
      where: { customerId: auth.client.id },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
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

    return NextResponse.json({
      orders: orders.map((o) => ({
        ...o,
        stages: o.stages.map((s) => ({
          id: s.id,
          name: nameByCode.get(s.stageCode) ?? s.stageCode,
          sequence: s.sequence,
          status: s.status,
          plannedDate: s.plannedDate,
          actualDate: s.actualDate,
        })),
      })),
    })
  } catch (e) {
    return apiErrorResponse(e, 'client/orders GET', 'Не удалось загрузить заявки')
  }
}
