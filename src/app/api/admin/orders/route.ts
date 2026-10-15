import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireEmployee } from '@/lib/auth'
import { ORDER_STATUSES, CARGO_PROFILES, type OrderStatus } from '@/lib/order-constants'
import { createOrderWithStages, findOrCreateCustomer, summarizeOrderStages, todayUtcMidnight } from '@/lib/orders'
import { normalizePhone } from '@/lib/phone'
import { logActivity, employeeActor } from '@/lib/activity'
import { parseListQuery, ciContains } from '@/lib/list-query'
import { apiErrorResponse } from '@/lib/api-errors'

// ─── GET /api/admin/orders — список заявок (Ж4: рабочий инструмент) ───
// Эталонный паттерн списка (принцип 2 очереди) — его копируют Ж5/Ж6:
//   ?q=      поиск по номеру, имени клиента, телефону клиента, ТН ВЭД
//   ?sort=   newest (умолчание) | oldest | number_asc | number_desc
//   ?take=&skip=  постраничность, ответ несёт hasMore
//   ?status= фильтр-таб по статусу (роадмап 8.1 — статусы ручные)
// Счётчики по статусам считаются по ТОМУ ЖЕ поиску, но без фильтра
// таба: табы показывают распределение найденного («у Иванова 2 в
// работе, 1 в расчёте»), а не всей базы.
// Колонки Ж4: «ближайший этап» (первый незавершённый по порядку),
// исполнитель этого этапа и отметка просрочки — незавершённый этап с
// плановой датой раньше сегодняшней (то же правило вынесет на главный
// экран Ж5 «Требует внимания» — здесь они рождаются).
const ORDER_SORTS = ['newest', 'oldest', 'number_asc', 'number_desc'] as const

function orderOrderBy(sort: string): Prisma.OrderOrderByWithRelationInput[] {
  switch (sort) {
    case 'oldest':
      return [{ createdAt: 'asc' }, { id: 'asc' }]
    case 'number_asc':
      // Составной номер «договор-порядковый» — сортируем по его частям,
      // лексикографика «10-2 < 2-1» тут не нужна.
      return [{ contract: { number: 'asc' } }, { numberInContract: 'asc' }, { id: 'asc' }]
    case 'number_desc':
      return [{ contract: { number: 'desc' } }, { numberInContract: 'desc' }, { id: 'asc' }]
    default:
      return [{ createdAt: 'desc' }, { id: 'asc' }]
  }
}

export async function GET(req: NextRequest) {
  const auth = await requireEmployee(req)
  if (!auth.ok) return auth.response

  const status = req.nextUrl.searchParams.get('status')
  if (status && !(ORDER_STATUSES as readonly string[]).includes(status)) {
    return NextResponse.json({ error: 'Неизвестный статус заявки' }, { status: 400 })
  }

  const parsed = parseListQuery(req.nextUrl.searchParams, {
    allowedSorts: ORDER_SORTS,
    defaultSort: 'newest',
  })
  if ('error' in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 })
  }
  const { q, sort, take, skip } = parsed

  try {
    // Поиск — только по заявке и её клиенту: номер, ТН ВЭД, имя, телефон.
    const search: Prisma.OrderWhereInput | undefined = q
      ? {
          OR: [
            { number: ciContains(q) },
            { hsCode: ciContains(q) },
            { customer: { name: ciContains(q) } },
            { customer: { phone: ciContains(q) } },
          ],
        }
      : undefined

    const conds: Prisma.OrderWhereInput[] = []
    if (status) conds.push({ status: status as OrderStatus })
    if (search) conds.push(search)
    const where: Prisma.OrderWhereInput = conds.length ? { AND: conds } : {}

    const [rows, grouped, catalog] = await Promise.all([
      db.order.findMany({
        where,
        orderBy: orderOrderBy(sort),
        // take+1 — классика без курсоров: одна лишняя строка отвечает
        // на вопрос «есть ли ещё» дешевле отдельного count.
        take: take + 1,
        skip,
        include: {
          customer: { select: { id: true, name: true, phone: true } },
          contract: { select: { id: true, number: true } },
          legalEntity: { select: { id: true, name: true } },
          // Все этапы с малым селектом: по ним считаются И прогресс
          // (total/done/problem), И ближайший, И просрочка — этапов в
          // заявке единицы, отдельный aggregate-запрос дороже JS-цикла.
          stages: {
            orderBy: { sequence: 'asc' },
            select: {
              stageCode: true,
              status: true,
              plannedDate: true,
              contractor: { select: { companyName: true } },
            },
          },
        },
      }),
      // Счётчики без фильтра таба (см. комментарий роута).
      db.order.groupBy({
        by: ['status'],
        where: search,
        _count: { _all: true },
      }),
      db.orderStageCatalog.findMany({ select: { code: true, name: true } }),
    ])

    const hasMore = rows.length > take
    const page = hasMore ? rows.slice(0, take) : rows

    const stageNames = new Map(catalog.map((c) => [c.code, c.name]))
    const todayUtc = todayUtcMidnight()

    const counts: Record<'all' | OrderStatus, number> = {
      all: 0,
      calculating: 0,
      confirmed: 0,
      in_progress: 0,
      completed: 0,
      cancelled: 0,
    }
    for (const g of grouped) {
      const n = g._count._all
      counts[g.status as OrderStatus] = n
      counts.all += n
    }

    return NextResponse.json({
      orders: page.map((o) => ({
        id: o.id,
        number: o.number,
        status: o.status,
        incoterm: o.incoterm,
        cargoProfile: o.cargoProfile,
        createdAt: o.createdAt,
        customer: o.customer,
        contract: o.contract,
        legalEntity: o.legalEntity,
        // Ж6а: сводка этапов (ближайший/прогресс/просрочка) вынесена
        // в lib/orders.ts — её же показывает карточка клиента.
        ...summarizeOrderStages(o.stages, stageNames, todayUtc),
      })),
      hasMore,
      counts,
    })
  } catch (e) {
    return apiErrorResponse(e, 'orders GET', 'Не удалось загрузить заявки')
  }
}

// ─── POST /api/admin/orders — создать заявку (Б3+Б4) ──────────
// Клиент: существующий (customerId) или новый (customerName+телефон).
// Договор пары клиент+юрлицо находится/создаётся прозрачно (роадмап
// 8.2). Обязательные этапы каталога подставляются автоматически,
// составной номер «договор-порядковый» — с retry-петлёй на гонку.
const CreateOrderSchema = z
  .object({
    customerId: z.string().min(1).optional(),
    customerName: z.string().min(1).optional(),
    customerPhone: z.string().optional().nullable(),
    customerEmail: z.string().email('Некорректный email').optional().nullable(),
    legalEntityId: z.string().min(1, 'Выберите юрлицо'),
    incoterm: z.string().trim().max(10).optional().nullable(),
    hsCode: z.string().trim().max(20).optional().nullable(),
    cargoProfile: z.enum(CARGO_PROFILES).default('standard'),
  })
  .refine((d) => d.customerId || d.customerName, {
    message: 'Укажите существующего клиента или имя нового',
  })

export async function POST(req: NextRequest) {
  const auth = await requireEmployee(req, { write: true })
  if (!auth.ok) return auth.response

  try {
    const body = await req.json()
    const parsed = CreateOrderSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Некорректные данные', details: parsed.error.flatten() },
        { status: 400 }
      )
    }
    const data = parsed.data

    const customer = await findOrCreateCustomer({
      customerId: data.customerId,
      name: data.customerName,
      phone: data.customerPhone ? normalizePhone(data.customerPhone) : null,
      email: data.customerEmail ?? null,
    })
    if ('error' in customer) {
      return NextResponse.json({ error: customer.error }, { status: customer.status })
    }

    const result = await createOrderWithStages({
      customerId: customer.id,
      legalEntityId: data.legalEntityId,
      incoterm: data.incoterm || null,
      hsCode: data.hsCode || null,
      cargoProfile: data.cargoProfile,
    })
    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    // Ж2: журнал — рождение заявки. Имя клиента для описания: нового
    // берём из тела, существующего поднимаем из справочника (в ответе
    // POST его нет, а ленте нужна причина-контекст).
    let customerLabel = data.customerName ?? null
    if (!customerLabel && data.customerId) {
      const existing = await db.customer.findUnique({
        where: { id: data.customerId },
        select: { name: true },
      })
      customerLabel = existing?.name ?? null
    }
    await logActivity(
      { orderId: result.id },
      employeeActor(auth.employee),
      'order_created',
      `Заявка №${result.number} создана вручную${customerLabel ? ` — клиент: ${customerLabel}` : ''}`,
    )

    return NextResponse.json({ order: result }, { status: 201 })
  } catch (e) {
    console.error('[orders POST] error:', e)
    return NextResponse.json({ error: 'Не удалось создать заявку' }, { status: 500 })
  }
}
