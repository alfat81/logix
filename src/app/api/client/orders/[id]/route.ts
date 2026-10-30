import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireClient } from '@/lib/client-auth'
import { apiErrorResponse } from '@/lib/api-errors'
import { ACTIVITY_FEED_TAKE, ACTIVITY_PUBLIC_FIELDS } from '@/lib/activity'
import { eventWhereFor } from '@/lib/audience'
import { projectActors } from '@/lib/actor-name'

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
        // DF-05: данные ожидания — наружу уходит ТОЛЬКО нейтральная
        // плашка «мяч у клиента» (см. сборку ответа ниже).
        waitingOnKind: true,
        waitingReason: true,
        waitingSince: true,
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
        // DF-21: журнал сделки в кабинете клиента — ТОЛЬКО события с
        // аудиторией 'client' (eventWhereFor; внутренние заметки и
        // служебные события сюда не попадают по построению, в т.ч.
        // заметка «видна клиенту» из админки). Проекция имён —
        // ридер клиента (коллеги — имена, чужие — компания, DF-02A).
        activities: {
          where: eventWhereFor('client'),
          orderBy: { createdAt: 'desc' },
          take: ACTIVITY_FEED_TAKE,
          select: ACTIVITY_PUBLIC_FIELDS,
        },
      },
    })
    if (!order) {
      return NextResponse.json({ error: 'Заявка не найдена' }, { status: 404 })
    }

    const catalog = await db.orderStageCatalog.findMany({ select: { code: true, name: true } })
    const nameByCode = new Map(catalog.map((c) => [c.code, c.name]))

    // Служебные колонки ожидания НЕ идут в ответ сырыми (в ключе
    // waitingOnKind может лежать 'contractor'/'manager' — наружу это
    // нельзя); из них собирается нейтральный waiting-объект ниже.
    const { waitingOnKind, waitingReason, waitingSince, ...orderSafe } = order

    // DF-21: имена актёров — по правилам ридера клиента («Анна,
    // Logix» / коллеги по имени); сама лента уже скоупена аудиторией.
    const activities = await projectActors(order.activities, {
      kind: 'client',
      customerId: auth.client.id,
    })

    return NextResponse.json({
      order: {
        ...orderSafe,
        // DF-05: клиент видит ожидание только когда мяч у НЕГО
        // («Ожидает вашего подтверждения»); служебные kind
        // (manager/broker/contractor) и их причины наружу не идут —
        // тест утечки аудитории (§4.5), D31: перевозчика клиент не видит.
        waiting:
          waitingOnKind === 'client' && waitingSince
            ? {
                reason: waitingReason,
                since: waitingSince.toISOString(),
              }
            : null,
        stages: order.stages.map((s) => ({
          id: s.id,
          name: nameByCode.get(s.stageCode) ?? s.stageCode,
          sequence: s.sequence,
          status: s.status,
          plannedDate: s.plannedDate,
          actualDate: s.actualDate,
        })),
        // DF-21: журнал — без служебных меток видимости (клиент видит
        // только свои события — помечать их ему незачем)
        activities,
      },
    })
  } catch (e) {
    return apiErrorResponse(e, 'client/order GET', 'Не удалось загрузить заявку')
  }
}
