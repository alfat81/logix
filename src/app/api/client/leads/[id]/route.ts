import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { requireClient } from '@/lib/client-auth'
import { apiErrorResponse } from '@/lib/api-errors'
import {
  buildLeadEditDiff,
  mergeLeadCargo,
  ClientLeadEditSchema,
} from '@/lib/lead-edit'
import { resolveRouteColumns } from '@/lib/ref-db'
import { clientActor } from '@/lib/activity'
import { emitEvent } from '@/lib/events'

type Params = { params: Promise<{ id: string }> }

// ─── Карточка запроса (лида) в кабинете клиента (Е, P1-02) ─────────
// До Е клиент видел свои запросы только списком; теперь у запроса есть
// карточка — анкета, которую он отправлял, статус и документы.
// Проекция без lostReason и вариантов (цены клиенту не показываются —
// решение №1), только свои запросы (404 на чужие).
//
// P1-02: клиент правит анкету груза, пока менеджер не начал расчёт
// (статус «новый», вариантов нет, заявки нет) — canEdit в ответе GET
// подсказывает UI, показывать ли кнопку правки. Каждая правка — событие
// «lead_edited» в журнале (актёр — клиент), менеджер видит её в ленте.

const CLIENT_LEAD_DETAIL_SELECT = {
  id: true,
  status: true,
  createdAt: true,
  cargoInfo: true,
  // P1-03: маршрут/метрики — колонки (карточка + diff правки)
  originCity: true,
  originCountry: true,
  destinationCity: true,
  destinationCountry: true,
  transportType: true,
  readyDate: true,
  weightKg: true,
  volumeM3: true,
  placesCount: true,
  order: { select: { id: true, number: true } },
  _count: { select: { options: true } },
} as const

export async function GET(req: NextRequest, { params }: Params) {
  const auth = await requireClient(req)
  if (!auth.ok) return auth.response

  const { id } = await params
  try {
    const lead = await db.lead.findFirst({
      where: { id, customerId: auth.client.id },
      select: CLIENT_LEAD_DETAIL_SELECT,
    })
    if (!lead) {
      return NextResponse.json({ error: 'Запрос не найден' }, { status: 404 })
    }
    const { _count, ...rest } = lead
    return NextResponse.json({
      lead: {
        ...rest,
        // P1-02: правка открыта до первого варианта расчёта
        canEdit: rest.status === 'new' && !rest.order && _count.options === 0,
      },
    })
  } catch (e) {
    return apiErrorResponse(e, 'client lead detail GET', 'Не удалось загрузить запрос')
  }
}

// ─── PATCH — правка анкеты запроса клиентом (P1-02) ────────────────
// cargoInfo — полная замена известных полей (неизвестные ключи старого
// Json сохраняются, mergeLeadCargo). Окно правки: статус «новый», нет
// ни одного варианта расчёта и нет заявки. Правка без изменений — 400.
export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await requireClient(req)
  if (!auth.ok) return auth.response

  const { id } = await params
  try {
    const body = await req.json()
    const parsed = ClientLeadEditSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Некорректные данные', details: parsed.error.flatten() },
        { status: 400 }
      )
    }
    const { cargoInfo, route } = parsed.data

    const lead = await db.lead.findFirst({
      where: { id, customerId: auth.client.id },
      select: CLIENT_LEAD_DETAIL_SELECT,
    })
    if (!lead) {
      return NextResponse.json({ error: 'Запрос не найден' }, { status: 404 })
    }

    // Окно правки — то же, что в canEdit GET-ответа (проверка на момент
    // действия: между открытием карточки и сохранением всё могло
    // измениться — менеджер добавил вариант или конвертировал запрос).
    if (!(lead.status === 'new' && !lead.order && lead._count.options === 0)) {
      return NextResponse.json(
        { error: 'Правка доступна, пока по запросу нет вариантов расчёта — напишите менеджеру' },
        { status: 409 }
      )
    }

    const diffs = buildLeadEditDiff(lead, { cargoInfo, route })
    if (!diffs.length) {
      return NextResponse.json({ error: 'Запрос не изменился' }, { status: 400 })
    }
    const description = diffs.join('; ')
    const merged = mergeLeadCargo(lead.cargoInfo, cargoInfo ?? null)

    // DF-17: коды стран — валидация + денормализация имён (клиент шлёт только код)
    const routeResolved = await resolveRouteColumns(route)
    if (routeResolved.error) {
      return NextResponse.json({ error: routeResolved.error }, { status: 400 })
    }

    await db.lead.update({
      where: { id },
      data: {
        // Json-колонка: каст как в админском PATCH (паттерн заявки Ж1);
        // null → Prisma.DbNull = SQL NULL («анкета очищена»)
        cargoInfo:
          merged === null
            ? Prisma.DbNull
            : (merged as unknown as Prisma.InputJsonObject),
        // P1-03/DF-17: маршрут/метрики + коды стран (undefined = не трогаем)
        ...routeResolved.columns,
      },
    })
    await emitEvent(db, {
      target: { leadId: id },
      actor: clientActor(auth.client),
      type: 'lead_edited',
      description,
    })

    return NextResponse.json({ ok: true, message: 'Запрос обновлён' })
  } catch (e) {
    return apiErrorResponse(e, 'client lead detail PATCH', 'Не удалось обновить запрос')
  }
}
