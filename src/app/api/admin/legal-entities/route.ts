import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireEmployee } from '@/lib/auth'
import { parseListQuery } from '@/lib/list-query'
import { apiErrorResponse } from '@/lib/api-errors'

// ─── GET /api/admin/legal-entities — наши юрлица (Ж6б) ────────
// Два режима, как у клиентов Ж6а:
//
// ЛЕГАСИ (без параметров списка): только АКТИВНЫЕ, сортировка по
// имени — так роут читает диалог создания заявки (OrdersList: Select
// без поиска, неактивное юрлицо предлагать нельзя). Форма ответа —
// та же, что у списка: легаси-потребитель просто не смотрит на
// hasMore/counts.
//
// СПИСОК (?take= и другие параметры Ж4): все юрлица, включая
// неактивные (с бейджем в UI), поиск по имени и реквизитам (ИНН и
// прочее — в JS, см. ниже), сортировки, take/skip + hasMore + counts,
// счётчики договоров и заявок по строке.
//
// Поиск здесь — исключение из SQL-паттерна Ж4, и оно осознанное:
// requisites — Json, а SQLite не принимает Json path-фильтры (урок
// Ж5/Ж7); при этом юрлиц у компании единицы-десятки, поэтому честнее
// один JS-проход по всей таблице, чем два мира WHERE с разной логикой.
// Контракт списка (поля ответа, take/skip, hasMore, counts) при этом
// точно такой же, как у остальных списков Ж4/Ж6а.
const LEGAL_ENTITY_SORTS = ['name_asc', 'name_desc', 'newest', 'oldest'] as const

const legalEntityInclude = { _count: { select: { orders: true, contracts: true } } } as const
type LegalEntityWithCounts = Prisma.LegalEntityGetPayload<{ include: typeof legalEntityInclude }>

function legalEntityRow(e: LegalEntityWithCounts) {
  return {
    id: e.id,
    name: e.name,
    requisites: e.requisites,
    isActive: e.isActive,
    createdAt: e.createdAt,
    ordersCount: e._count.orders,
    contractsCount: e._count.contracts,
  }
}

// Строка для поиска по реквизитам: значения полей (ИНН, КПП, адрес,
// банк…) склеиваются — структура Json свободная (роадмап, раздел 4),
// поэтому ищем по любому значению, а не по фиксированным ключам.
function requisitesSearchString(requisites: unknown): string {
  if (!requisites || typeof requisites !== 'object' || Array.isArray(requisites)) return ''
  return Object.values(requisites as Record<string, unknown>)
    .filter((v): v is string | number => typeof v === 'string' || typeof v === 'number')
    .join(' ')
    .toLowerCase()
}

export async function GET(req: NextRequest) {
  const auth = await requireEmployee(req)
  if (!auth.ok) return auth.response

  const params = req.nextUrl.searchParams
  const wantsList = ['q', 'sort', 'take', 'skip'].some((p) => params.has(p))

  try {
    // Загружаем всё сразу: справочник маленький, а фильтр по Json-
    // реквизитам возможен только в JS (см. комментарий роута).
    const all = await db.legalEntity.findMany({
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      include: legalEntityInclude,
    })

    if (!wantsList) {
      // Легаси: активные, только базовые поля (контракт Select'а).
      const active = all
        .filter((e) => e.isActive)
        .map((e) => ({
          id: e.id,
          name: e.name,
          isActive: e.isActive,
          createdAt: e.createdAt,
        }))
      return NextResponse.json({ legalEntities: active, hasMore: false, counts: { all: active.length } })
    }

    const parsed = parseListQuery(params, {
      allowedSorts: LEGAL_ENTITY_SORTS,
      defaultSort: 'name_asc',
    })
    if ('error' in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 })
    }
    const { q, sort, take, skip } = parsed

    const needle = q.toLowerCase()
    const filtered = q
      ? all.filter(
          (e) =>
            e.name.toLowerCase().includes(needle) ||
            requisitesSearchString(e.requisites).includes(needle)
        )
      : [...all]

    // Сортировка в JS (таблица уже целиком в памяти — см. выше).
    filtered.sort((a, b) => {
      switch (sort) {
        case 'name_desc':
          return b.name.localeCompare(a.name, 'ru') || a.id.localeCompare(b.id)
        case 'newest':
          return b.createdAt.getTime() - a.createdAt.getTime() || a.id.localeCompare(b.id)
        case 'oldest':
          return a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id)
        default:
          return a.name.localeCompare(b.name, 'ru') || a.id.localeCompare(b.id)
      }
    })

    const hasMore = skip + take < filtered.length
    const page = filtered.slice(skip, skip + take)

    return NextResponse.json({
      legalEntities: page.map(legalEntityRow),
      hasMore,
      counts: { all: filtered.length },
    })
  } catch (e) {
    return apiErrorResponse(e, 'legal-entities GET', 'Не удалось загрузить юрлица')
  }
}

// ─── POST /api/admin/legal-entities — добавить юрлицо ─────────
// На старте несколько юрлиц по одному шаблону, различия — только в
// реквизитах для документов (роадмап, раздел 4).
//
// Реквизиты — свободная структура (точная форма фиксируется при
// генерации печатных документов, роадмап: «не фиксировать до реальных
// форм»), поэтому это Json-объект, а не колонки. Сервер следит только
// за тем, чтобы значения были скалярами разумной длины — остальное
// определяет форма Ж6б (lib/requisite-fields.ts).
const RequisitesSchema = z.record(z.union([z.string().trim().max(500), z.number(), z.boolean(), z.null()]))

const CreateLegalEntitySchema = z.object({
  name: z.string().trim().min(1, 'Укажите название юрлица').max(300),
  requisites: RequisitesSchema.optional(),
})

export async function POST(req: NextRequest) {
  const auth = await requireEmployee(req, { write: true })
  if (!auth.ok) return auth.response

  try {
    const body = await req.json()
    const parsed = CreateLegalEntitySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Некорректные данные', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const legalEntity = await db.legalEntity.create({
      data: {
        name: parsed.data.name,
        requisites: parsed.data.requisites ?? { note: 'реквизиты заполнить' },
      },
      select: { id: true, name: true },
    })
    return NextResponse.json({ legalEntity }, { status: 201 })
  } catch (e) {
    return apiErrorResponse(e, 'legal-entities POST', 'Не удалось создать юрлицо')
  }
}
