import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireEmployee } from '@/lib/auth'
import { ORDER_STATUSES, ORDER_ACTIVE_STATUSES, CARGO_PROFILES, type OrderStatus } from '@/lib/order-constants'
import { createOrderWithStages, findOrCreateCustomer, summarizeOrderStages, calcOrderEta, todayUtcMidnight } from '@/lib/orders'
import { normalizePhone } from '@/lib/phone'
import { employeeActor } from '@/lib/activity'
import { emitEvent } from '@/lib/events'
import { parseListQuery, ciContains } from '@/lib/list-query'
import { ORDER_SORTS, orderOrderBy } from '@/lib/orders'
import { TRANSPORT_TYPE_CODES, type TransportTypeCode } from '@/lib/route-fields'
import { apiErrorResponse } from '@/lib/api-errors'

// ─── GET /api/admin/orders — список заявок (Ж4: рабочий инструмент) ───
// Эталонный паттерн списка (принцип 2 очереди) — его копируют Ж5/Ж6:
//   ?q=      поиск по номеру, имени клиента, телефону клиента, ТН ВЭД
//   ?sort=   newest (умолчание) | oldest | number_asc | number_desc |
//            stale («давно без движения», updatedAt asc — P1-01)
//   ?take=&skip=  постраничность, ответ несёт hasMore
//   ?status= фильтр-таб по статусу (роадмап 8.1 — статусы ручные);
//            v0.3.1 (BRANDBOOK §4.2): плюс группа «active» —
//            calculating+confirmed+in_progress (таб «Активные»),
//            состав группы — ORDER_ACTIVE_STATUSES (lib/order-constants)
//   ?assigned=mine|unassigned|all — фильтр ответственного (P1-01)
// Счётчики по статусам считаются по ТОМУ ЖЕ поиску, но без фильтра
// таба: табы показывают распределение найденного («у Иванова 2 в
// работе, 1 в расчёте»), а не всей базы.
// Колонки Ж4: «ближайший этап» (первый незавершённый по порядку),
// исполнитель этого этапа и отметка просрочки — незавершённый этап с
// плановой датой раньше сегодняшней (то же правило вынесет на главный
// экран Ж5 «Требует внимания» — здесь они рождаются).
// Сортировки (?sort=) — lib/orders.ts (ORDER_SORTS/orderOrderBy);
// v0.3.1 — переезд ради лимита 300 строк (RULES 2.14).
const ORDER_ASSIGNED_FILTERS = ['mine', 'unassigned', 'all'] as const

export async function GET(req: NextRequest) {
  const auth = await requireEmployee(req)
  if (!auth.ok) return auth.response

  const status = req.nextUrl.searchParams.get('status')
  if (status && !(ORDER_STATUSES as readonly string[]).includes(status) && status !== 'active') {
    return NextResponse.json({ error: 'Неизвестный статус заявки' }, { status: 400 })
  }

  const assigned = req.nextUrl.searchParams.get('assigned') ?? 'all'
  if (!(ORDER_ASSIGNED_FILTERS as readonly string[]).includes(assigned)) {
    return NextResponse.json({ error: 'Неизвестный фильтр ответственного (assigned)' }, { status: 400 })
  }

  const parsed = parseListQuery(req.nextUrl.searchParams, {
    allowedSorts: ORDER_SORTS,
    defaultSort: 'newest',
  })
  if ('error' in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 })
  }
  const { q, sort, take, skip } = parsed

  // P1-03: фильтры направления и типа («Китай → Москва, Море»)
  const origin = req.nextUrl.searchParams.get('origin') ?? ''
  const destination = req.nextUrl.searchParams.get('destination') ?? ''
  const transport = req.nextUrl.searchParams.get('transport') ?? ''
  if (transport && !(TRANSPORT_TYPE_CODES as readonly string[]).includes(transport)) {
    return NextResponse.json({ error: 'Неизвестный тип перевозки (transport)' }, { status: 400 })
  }

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
    // v0.3.1: статус ИЛИ группа «active» (BRANDBOOK §4.2 — таб «Активные»)
    if (status === 'active') conds.push({ status: { in: [...ORDER_ACTIVE_STATUSES] } })
    else if (status) conds.push({ status: status as OrderStatus })
    // P1-01: mine — «заявку веду я»; unassigned — разбор без ответственного
    if (assigned === 'mine') conds.push({ assignedToId: auth.employee.id })
    if (assigned === 'unassigned') conds.push({ assignedToId: null })
    // P1-03: фильтры по направлению и типу («Китай → Москва, Море»):
    // направление — ILIKE и по стране, и по городу (свободный ввод)
    if (origin) {
      conds.push({
        OR: [
          { originCity: ciContains(origin) },
          { originCountry: ciContains(origin) },
        ],
      })
    }
    if (destination) {
      conds.push({
        OR: [
          { destinationCity: ciContains(destination) },
          { destinationCountry: ciContains(destination) },
        ],
      })
    }
    if (transport) conds.push({ transportType: transport as TransportTypeCode })
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
          assignee: { select: { id: true, name: true } },
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
        // P1-01: ответственный и маркер движения — колонки списка
        assignee: o.assignee,
        updatedAt: o.updatedAt,
        customer: o.customer,
        contract: o.contract,
        legalEntity: o.legalEntity,
        // P1-03: маршрут и тип — строка 2 карточки списка (§4.3)
        originCity: o.originCity,
        originCountry: o.originCountry,
        destinationCity: o.destinationCity,
        destinationCountry: o.destinationCountry,
        transportType: o.transportType,
        // Ж6а: сводка этапов (ближайший/прогресс/просрочка) вынесена
        // в lib/orders.ts — её же показывает карточка клиента.
        ...summarizeOrderStages(o.stages, stageNames, todayUtc),
        // v0.3.1 (BRANDBOOK §4.3): ETA — обещанная дата завершения
        // (максимум плана незавершённых); считается в lib/orders.ts.
        etaDate: calcOrderEta(o.stages)?.toISOString() ?? null,
        // v0.3.1 (BRANDBOOK §4.3): этапы для степпера карточки списка
        // (круги с иконками); короткие подписи и иконки — клиентская
        // визуализация lib/stage-visuals.ts, сюда — только данные.
        stages: o.stages.map((s) => ({
          code: s.stageCode,
          name: stageNames.get(s.stageCode) ?? s.stageCode,
          status: s.status,
        })),
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
      // P1-01: при создании ответственный — текущий сотрудник (кто
      // завёл заявку, тот и ведёт)
      assignedToId: auth.employee.id,
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
    await emitEvent(db, {
      target: { orderId: result.id },
      actor: employeeActor(auth.employee),
      type: 'order_created',
      description: `Заявка №${result.number} создана вручную${customerLabel ? ` — клиент: ${customerLabel}` : ''}`,
    })

    return NextResponse.json({ order: result }, { status: 201 })
  } catch (e) {
    console.error('[orders POST] error:', e)
    return NextResponse.json({ error: 'Не удалось создать заявку' }, { status: 500 })
  }
}
