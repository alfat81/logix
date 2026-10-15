import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireContractor } from '@/lib/contractor-auth'
import { apiErrorResponse } from '@/lib/api-errors'

// ─── GET /api/contractor/orders — заявки с моими этапами (Г4) ────
// «Видит только свои назначенные заявки» (роадмап, раздел 1): заявка
// попадает в выдачу, если на ней есть ХОТЯ БЫ один его этап. Состав
// урезанный: номер/статус/создана + только СВОИ этапы (чужие этапы
// той же заявки — контекст карточки, не списка). Клиент/договор/
// юрлицо/стоимость — не отдаются: коммерческие данные сделки не для
// ЛК соисполнителя.
export async function GET(req: NextRequest) {
  const auth = await requireContractor(req)
  if (!auth.ok) return auth.response

  try {
    // Имя этапа — живой lookup по каталогу (паттерн карточки заявки
    // из Б5): stageCode — служебный код, человеку нужно название.
    const catalog = await db.orderStageCatalog.findMany({ select: { code: true, name: true } })
    const nameByCode = new Map(catalog.map((c) => [c.code, c.name]))

    const orders = await db.order.findMany({
      where: { stages: { some: { contractorId: auth.contractor.id } } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        number: true,
        status: true,
        createdAt: true,
        stages: {
          where: { contractorId: auth.contractor.id },
          orderBy: { sequence: 'asc' },
          select: {
            id: true,
            stageCode: true,
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
          ...s,
          name: nameByCode.get(s.stageCode) ?? s.stageCode,
        })),
      })),
    })
  } catch (e) {
    return apiErrorResponse(e, 'contractor/orders GET', 'Не удалось загрузить заявки')
  }
}
