import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireEmployee } from '@/lib/auth'
import { normalizePhone, phoneVariants } from '@/lib/phone'
import { parseListQuery, ciContains } from '@/lib/list-query'
import { apiErrorResponse } from '@/lib/api-errors'

// ─── GET /api/admin/customers — справочник клиентов (Ж6а: паттерн Ж4) ──
// Список-инструмент: ?q= (имя, телефон с вариантами набора — как
// глобальный поиск Ж7, email, комментарий) + ?sort= + постраничность
// take/skip с hasMore + counts.
//
// ЛЕГАСИ-режим: без параметров списка (нет ни q, ни sort, ни take,
// ни skip) роут отдаёт ВЕСЬ справочник одной страницей — так его
// читает диалог создания заявки (OrdersList: Select без поиска, нужны
// все строки). Список клиентов (Ж6а) всегда шлёт параметры — и
// получает страницу. Форма ответа при этом одна: { customers,
// hasMore, counts } — легаси-потребитель просто не смотрит на
// hasMore/counts.
const CUSTOMER_SORTS = ['name_asc', 'name_desc', 'newest', 'oldest'] as const

function customerOrderBy(sort: string): Prisma.CustomerOrderByWithRelationInput[] {
  switch (sort) {
    case 'name_desc':
      return [{ name: 'desc' }, { id: 'asc' }]
    case 'newest':
      return [{ createdAt: 'desc' }, { id: 'asc' }]
    case 'oldest':
      return [{ createdAt: 'asc' }, { id: 'asc' }]
    default:
      return [{ name: 'asc' }, { id: 'asc' }]
  }
}

const customerInclude = { _count: { select: { orders: true, contracts: true, leads: true } } } as const
type CustomerWithCounts = Prisma.CustomerGetPayload<{ include: typeof customerInclude }>

function customerRow(c: CustomerWithCounts) {
  return {
    id: c.id,
    name: c.name,
    phone: c.phone,
    email: c.email,
    comment: c.comment,
    isActive: c.isActive,
    createdAt: c.createdAt,
    ordersCount: c._count.orders,
    contractsCount: c._count.contracts,
    leadsCount: c._count.leads,
  }
}

export async function GET(req: NextRequest) {
  const auth = await requireEmployee(req)
  if (!auth.ok) return auth.response

  const params = req.nextUrl.searchParams
  const wantsList = ['q', 'sort', 'take', 'skip'].some((p) => params.has(p))

  try {
    if (!wantsList) {
      // Легаси: полный справочник (см. комментарий роута).
      const customers = await db.customer.findMany({
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        include: customerInclude,
      })
      return NextResponse.json({
        customers: customers.map(customerRow),
        hasMore: false,
        counts: { all: customers.length },
      })
    }

    const parsed = parseListQuery(params, {
      allowedSorts: CUSTOMER_SORTS,
      defaultSort: 'name_asc',
    })
    if ('error' in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 })
    }
    const { q, sort, take, skip } = parsed

    // Телефон в справочнике нормализован (+7XXXXXXXXXX), а набирают
    // его по-разному — те же варианты запроса, что в Ж7.
    const search: Prisma.CustomerWhereInput | undefined = q
      ? {
          OR: [
            { name: ciContains(q) },
            { email: ciContains(q) },
            { comment: ciContains(q) },
            { phone: ciContains(q) },
            ...phoneVariants(q).map((v) => ({ phone: { contains: v } })),
          ],
        }
      : undefined

    const [rows, total] = await Promise.all([
      db.customer.findMany({
        where: search,
        orderBy: customerOrderBy(sort),
        take: take + 1,
        skip,
        include: customerInclude,
      }),
      db.customer.count({ where: search }),
    ])

    const hasMore = rows.length > take
    const page = hasMore ? rows.slice(0, take) : rows

    return NextResponse.json({
      customers: page.map(customerRow),
      hasMore,
      counts: { all: total },
    })
  } catch (e) {
    return apiErrorResponse(e, 'customers GET', 'Не удалось загрузить клиентов')
  }
}

// ─── POST /api/admin/customers — завести клиента заранее ──────
// (можно и мимо этого роута: заявка с новым именем создаст клиента
// сама — find-or-create, см. lib/orders.ts)
const CreateCustomerSchema = z.object({
  name: z.string().trim().min(1, 'Укажите имя клиента').max(200),
  phone: z.string().optional().nullable(),
  email: z.string().email('Некорректный email').optional().nullable(),
  comment: z.string().trim().max(500).optional().nullable(),
})

export async function POST(req: NextRequest) {
  const auth = await requireEmployee(req, { write: true })
  if (!auth.ok) return auth.response

  try {
    const body = await req.json()
    const parsed = CreateCustomerSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Некорректные данные', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const phone = parsed.data.phone ? normalizePhone(parsed.data.phone) : null
    if (parsed.data.phone && !phone) {
      return NextResponse.json({ error: 'Некорректный телефон' }, { status: 400 })
    }

    if (phone) {
      const existing = await db.customer.findFirst({ where: { phone } })
      if (existing) {
        return NextResponse.json(
          { error: `Клиент с телефоном ${phone} уже существует: ${existing.name}` },
          { status: 409 }
        )
      }
    }

    const customer = await db.customer.create({
      data: {
        name: parsed.data.name,
        phone,
        email: parsed.data.email ?? null,
        comment: parsed.data.comment ?? null,
      },
    })
    // И1: хеш пароля кабинета не покидает сервер никогда — ответ
    // собирается явной проекцией (как EMPLOYEE_PUBLIC_FIELDS у
    // сотрудников): новые колонки модели не утекут автоматически.
    return NextResponse.json(
      {
        customer: {
          id: customer.id,
          name: customer.name,
          phone: customer.phone,
          email: customer.email,
          comment: customer.comment,
          isActive: customer.isActive,
          createdAt: customer.createdAt,
        },
      },
      { status: 201 }
    )
  } catch (e) {
    console.error('[customers POST] error:', e)
    return NextResponse.json({ error: 'Не удалось создать клиента' }, { status: 500 })
  }
}
