import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { requireEmployee } from '@/lib/auth'
import { parseListQuery, ciContains } from '@/lib/list-query'
import { apiErrorResponse } from '@/lib/api-errors'

// ─── GET /api/admin/contracts — список рамочных договоров (Ж6а: Ж4) ──
// Паттерн Ж4: ?q= (номер, клиент, юрлицо) + сортировка + постраничность
// take/skip с hasMore + counts. Создание договора вручную не нужно:
// он появляется прозрачно в момент первой заявки пары клиент+юрлицо
// (роадмап, 8.2) — поэтому у роута нет POST, а у списка нет кнопки.
//
// Номер договора — Int: contains по числу БД не умеет, поэтому цифро-
// вой запрос ищется ТОЧНЫМ совпадением («17» → договор №17) — номер
// набирают целиком; частичный поиск остаётся по клиенту и юрлицу.
const CONTRACT_SORTS = ['number_asc', 'number_desc', 'newest', 'oldest'] as const

function contractOrderBy(sort: string): Prisma.ContractOrderByWithRelationInput[] {
  switch (sort) {
    case 'number_desc':
      return [{ number: 'desc' }, { id: 'asc' }]
    case 'newest':
      return [{ createdAt: 'desc' }, { id: 'asc' }]
    case 'oldest':
      return [{ createdAt: 'asc' }, { id: 'asc' }]
    default:
      return [{ number: 'asc' }, { id: 'asc' }]
  }
}

const contractInclude = {
  customer: { select: { id: true, name: true, phone: true } },
  legalEntity: { select: { id: true, name: true } },
  _count: { select: { orders: true } },
} as const

type ContractWithRelations = Prisma.ContractGetPayload<{ include: typeof contractInclude }>

function contractRow(c: ContractWithRelations) {
  return {
    id: c.id,
    number: c.number,
    signedAt: c.signedAt,
    createdAt: c.createdAt,
    customer: c.customer,
    legalEntity: c.legalEntity,
    ordersCount: c._count.orders,
  }
}

export async function GET(req: NextRequest) {
  const auth = await requireEmployee(req)
  if (!auth.ok) return auth.response

  const parsed = parseListQuery(req.nextUrl.searchParams, {
    allowedSorts: CONTRACT_SORTS,
    defaultSort: 'number_asc',
  })
  if ('error' in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 })
  }
  const { q, sort, take, skip } = parsed

  try {
    const search: Prisma.ContractWhereInput | undefined = q
      ? {
          OR: [
            { customer: { name: ciContains(q) } },
            { legalEntity: { name: ciContains(q) } },
            ...(q.trim() !== '' && /^\d+$/.test(q.trim())
              ? [{ number: Number(q.trim()) }]
              : []),
          ],
        }
      : undefined

    const [rows, total] = await Promise.all([
      db.contract.findMany({
        where: search,
        orderBy: contractOrderBy(sort),
        take: take + 1,
        skip,
        include: contractInclude,
      }),
      db.contract.count({ where: search }),
    ])

    const hasMore = rows.length > take
    const page = hasMore ? rows.slice(0, take) : rows

    return NextResponse.json({
      contracts: page.map(contractRow),
      hasMore,
      counts: { all: total },
    })
  } catch (e) {
    return apiErrorResponse(e, 'contracts GET', 'Не удалось загрузить договоры')
  }
}
