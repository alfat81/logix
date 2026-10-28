import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { requireClient } from '@/lib/client-auth'
import { apiErrorResponse } from '@/lib/api-errors'
import { clientActor } from '@/lib/activity'
import { emitEvent } from '@/lib/events'
import {
  ClientCreateRequestSchema,
  CLIENT_LEAD_DAILY_LIMIT,
} from '@/lib/client-constants'
import { resolveDealCodes } from '@/lib/ref-db'

// ─── Запросы клиента в кабинете (И1) ────────────────────────────────
// GET  — «мои запросы»: лиды клиента (любого источника — и созданные
//        из кабинета, и заведённые менеджером по телефону/почте: это
//        его собственные обращения, показывать их назад честно).
//        Проекция без lostReason (внутренняя причина отказа) и без
//        вариантов расчёта — цены клиенту не показываются до решения
//        по ценообразованию (решение вопроса №1, 14.10.2026).
// POST — новый запрос: лид источника «кабинет» со статусом «новый»,
//        менеджер видит его в общем списке (В2) с бейджем «Кабинет».

// Что видит клиент в своём запросе (выжимка): статус воронки, анкета
// груза, связь с заявкой после конвертации. Всё.
const CLIENT_LEAD_SELECT = {
  id: true,
  status: true,
  createdAt: true,
  cargoInfo: true,
  order: { select: { id: true, number: true } },
} as const

export async function GET(req: NextRequest) {
  const auth = await requireClient(req)
  if (!auth.ok) return auth.response

  try {
    const leads = await db.lead.findMany({
      where: { customerId: auth.client.id },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      select: CLIENT_LEAD_SELECT,
    })
    return NextResponse.json({ leads })
  } catch (e) {
    return apiErrorResponse(e, 'client/leads GET', 'Не удалось загрузить запросы')
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireClient(req)
  if (!auth.ok) return auth.response

  try {
    // Пустое/битое тело — 400, а не 500 (паттерн всех write-роутов)
    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Некорректный JSON в теле запроса' }, { status: 400 })
    }
    const parsed = ClientCreateRequestSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Некорректные данные', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    // Анти-спам внешнего портала: не больше N запросов из кабинета
    // на клиента за сутки (лимиты никто не съедает, кроме самого
    // клиента). Считаются только «кабинетные» лиды — созданные
    // менеджером запросы этого же клиента в счёт не идут.
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const todayCount = await db.lead.count({
      where: { customerId: auth.client.id, source: 'cabinet', createdAt: { gte: dayAgo } },
    })
    if (todayCount >= CLIENT_LEAD_DAILY_LIMIT) {
      return NextResponse.json(
        {
          error: `Слишком много запросов за сутки (лимит ${CLIENT_LEAD_DAILY_LIMIT}). Обратитесь к менеджеру.`,
        },
        { status: 429 }
      )
    }

    // rawContact — СНИМОК профиля клиента на момент запроса (семантика
    // В1: анкета как есть). customerId авторитетнее — конвертация В4
    // возьмёт клиента из него, но снимок оставляет след «кто спрашивал»
    // в родной форме лида.
    const rawContact: Prisma.InputJsonObject = {
      name: auth.client.name,
      ...(auth.client.phone ? { phone: auth.client.phone } : {}),
      ...(auth.client.email ? { email: auth.client.email } : {}),
    }

    // DF-17: коды стран/условие поставки — единая валидация по
    // справочнику с денормализацией имён (кабинет клиента шлёт только коды;
    // lib/ref-db.ts — одно место знания).
    const deal = await resolveDealCodes(parsed.data.route, parsed.data.incotermCode)
    if (deal.error) {
      return NextResponse.json({ error: deal.error }, { status: 400 })
    }

    const lead = await db.lead.create({
      data: {
        status: 'new',
        source: 'cabinet',
        customerId: auth.client.id,
        rawContact,
        ...(parsed.data.cargoInfo && Object.keys(parsed.data.cargoInfo).length > 0
          ? {
              // v: 1 — маркер версии анкеты-rest, ставит сервер (P1-03)
              cargoInfo: {
                ...(parsed.data.cargoInfo as Record<string, unknown>),
                v: 1,
              } as unknown as Prisma.InputJsonObject,
            }
          : {}),
        // P1-03/DF-17: маршрут/метрики + коды стран с денормализованными именами
        ...deal.columns,
        incotermCode: deal.incoterm,
      },
      select: CLIENT_LEAD_SELECT,
    })

    // Ж2: рождение лида из кабинета — в общую ленту лида. Новый тип
    // актёра 'client' (решение И1): до сих пор ленту писали только
    // сотрудники и подрядчики.
    await emitEvent(db, {
      target: { leadId: lead.id },
      actor: clientActor(auth.client),
      type: 'lead_created',
      description: 'Запрос создан клиентом в кабинете',
    })

    return NextResponse.json({ lead, message: 'Запрос отправлен' }, { status: 201 })
  } catch (e) {
    return apiErrorResponse(e, 'client/leads POST', 'Не удалось создать запрос')
  }
}
