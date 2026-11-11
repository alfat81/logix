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
import { ROUTE_COLUMN_SELECT } from '@/lib/route-fields'
import { clientActor } from '@/lib/activity'
import { emitEvent } from '@/lib/events'
import { ACTIVITY_FEED_TAKE, ACTIVITY_PUBLIC_FIELDS } from '@/lib/activity'
import { eventWhereFor } from '@/lib/audience'
import { projectActors } from '@/lib/actor-name'
import { PERMIT_EXTERNAL_FIELDS } from '@/lib/permits-db'
import { detectPriceSignificantChanges } from '@/lib/option-snapshots'

type Params = { params: Promise<{ id: string }> }

// ─── Карточка запроса (лида) в кабинете клиента (Е, P1-02) ─────────
// До Е клиент видел свои запросы только списком; теперь у запроса есть
// карточка — анкета, которую он отправлял, статус и документы.
// Проекция без lostReason, только свои запросы (404 на чужие).
// Поток A волна 1 (BL-7): клиент видит варианты и продажные цены
// (пересмотр решения №1 — решение владельца от 04.11.2026, D49):
// наружная проекция вариантов БЕЗ costEstimate/costCurrency (комментарий
// в коде — пересмотр решения №1); согласованная карточка дополнительно
// отдаёт метаданные согласования (дата/способ/имя) и зафиксированные
// условия из активного снимка согласования (что клиент видел в момент
// согласия — то и отображается). Клиент НЕ видит: себестоимость, валюту
// себестоимости, маржу, внутренние события (спецификация п. 7).
//
// P1-02: клиент правит анкету груза, пока менеджер не начал расчёт
// (статус «новый», вариантов нет, заявки нет) — canEdit в ответе GET
// подсказывает UI, показывать ли кнопку правки. Каждая правка — событие
// «lead_edited» в журнале (актёр — клиент), менеджер видит её в ленте.

// Наружная проекция варианта расчёта: продажные поля без себестоимости
// (belt-and-suspenders — наружу уходят ТОЛЬКО перечисленные поля).
const CLIENT_OPTION_FIELDS = {
  id: true,
  description: true,
  transportModes: true,
  price: true,
  currency: true,
  vatMode: true,
  etaDays: true,
  priorityFit: true,
  isSelected: true,
  createdAt: true,
  // DF-27 (план §11.2): в клиентскую проекцию варианта добавляется
  // ТОЛЬКО пометка предварительного расчёта (строки расчёта, итоги,
  // provenance и флаг пересмотра цены — не покидают сервер)
  isPreliminary: true,
} as const

const CLIENT_LEAD_DETAIL_SELECT = {
  id: true,
  status: true,
  createdAt: true,
  cargoInfo: true,
  // P1-03: маршрут/метрики — колонки (карточка + diff правки)
  ...ROUTE_COLUMN_SELECT,
  order: { select: { id: true, number: true } },
  // BL-7: варианты с продажными ценами (без себестоимости)
  options: { orderBy: { createdAt: 'asc' }, select: CLIENT_OPTION_FIELDS },
  // BL-3: метаданные активного согласования (факт: кто/как/когда)
  selectedOptionId: true,
  clientConfirmedAt: true,
  clientConfirmedVia: true,
  clientConfirmedByName: true,
  // BL-7: активный снимок согласования — зафиксированные условия
  // (история снимков наружу не отдаётся; себестоимости в снимке нет
  // по схеме — belt-and-suspenders)
  approvalSnapshots: {
    orderBy: { confirmedAt: 'desc' },
    take: 1,
    select: {
      description: true,
      transportModes: true,
      price: true,
      currency: true,
      vatMode: true,
      etaDays: true,
      priorityFit: true,
      confirmedAt: true,
      confirmedVia: true,
    },
  },
  _count: { select: { options: true } },
  // DF-21: журнал запроса — только события с аудиторией 'client'
  // (eventWhereFor); имена актёров — ридер клиента (DF-02A)
  activities: {
    where: eventWhereFor('client'),
    orderBy: { createdAt: 'desc' },
    take: ACTIVITY_FEED_TAKE,
    select: ACTIVITY_PUBLIC_FIELDS,
  },
  // DF-16: разрешительные запроса — строки видит клиент (наружная
  // проекция, staffNote не покидает сервер; сортировку делает UI —
  // константа with as const, mutable orderBy туда не вставить).
  permitRequirements: {
    select: PERMIT_EXTERNAL_FIELDS,
  },
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
    // DF-21: проекция имён актёров журнала под ридера клиента
    const activities = await projectActors(lead.activities, {
      kind: 'client',
      customerId: auth.client.id,
      companyName: auth.client.name,
    })
    // BL-7: активный снимок согласования — наружу только при активном
    // согласовании (история снимков клиенту не отдаётся).
    const activeSnapshot =
      rest.status === 'client_approved' && rest.clientConfirmedAt
        ? (lead.approvalSnapshots.find(
            (s) => s.confirmedAt.getTime() === rest.clientConfirmedAt!.getTime()
          ) ?? null)
        : null
    return NextResponse.json({
      lead: {
        ...rest,
        activities,
        approvalSnapshot: activeSnapshot,
        // P1-02: правка открыта до первого варианта расчёта
        canEdit: rest.status === 'new' && !rest.order && _count.options === 0,
        // BL-1: клиент может согласовать вариант, пока согласование не активно
        canConfirm: rest.status === 'calculated' && !rest.order,
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

    // DF-27 (ТЗ §5.5): клиентская правка с ценозначимыми ключами —
    // тот же автомат, что в админском PATCH (флаг — всем вариантам,
    // та же транзакция с сохранением).
    const priceKeys = detectPriceSignificantChanges(lead, { route, mergedCargo: merged })
    const clientUpdate = db.lead.update({
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
    await db.$transaction([
      clientUpdate,
      ...(priceKeys.length > 0
        ? [
            db.quoteOption.updateMany({
              where: { leadId: id, priceReviewRequired: false },
              data: { priceReviewRequired: true },
            }),
          ]
        : []),
    ])
    await emitEvent(db, {
      target: { leadId: id },
      actor: clientActor(auth.client),
      type: 'lead_edited',
      description:
        description +
        (priceKeys.length > 0
          ? ` — ценозначимые данные изменились (${priceKeys.join(', ')}): варианты требуют пересмотра цены`
          : ''),
    })

    return NextResponse.json({ ok: true, message: 'Запрос обновлён' })
  } catch (e) {
    return apiErrorResponse(e, 'client lead detail PATCH', 'Не удалось обновить запрос')
  }
}
