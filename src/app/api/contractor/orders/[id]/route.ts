import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireContractor } from '@/lib/contractor-auth'
import { apiErrorResponse } from '@/lib/api-errors'

type Params = { params: Promise<{ id: string }> }

// ─── GET /api/contractor/orders/[id] — урезанная карточка (Г4) ────
// Номер, статус, этапы — ВСЕ этапы заявки (подрядчику нужен контекст
// цепочки: что до и после его участка), свои помечены isMine. Чужая
// заявка — 404, а не 403: сам факт существования чужой сделки не
// раскрываем (нет доступа = «не найдено», единообразно с PATCH ниже).
export async function GET(req: NextRequest, { params }: Params) {
  const auth = await requireContractor(req)
  if (!auth.ok) return auth.response

  const { id } = await params
  try {
    const order = await db.order.findFirst({
      where: { id, stages: { some: { contractorId: auth.contractor.id } } },
      select: {
        id: true,
        number: true,
        status: true,
        createdAt: true,
        stages: {
          orderBy: { sequence: 'asc' },
          select: {
            id: true,
            stageCode: true,
            sequence: true,
            status: true,
            plannedDate: true,
            actualDate: true,
            contractorId: true,
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
          // Свои этапы UI помечает и даёт кнопки статуса; contractorId
          // наружу не отдаём — вместо него булев флаг принадлежности.
          isMine: s.contractorId === auth.contractor.id,
        })),
      },
    })
  } catch (e) {
    return apiErrorResponse(e, 'contractor/order GET', 'Не удалось загрузить заявку')
  }
}
