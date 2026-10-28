import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { requireEmployee } from '@/lib/auth'
import { CreateLeadSchema, LEAD_STATUSES, type LeadStatus } from '@/lib/leads'
import {
  TRANSPORT_TYPE_CODES,
  type TransportTypeCode,
} from '@/lib/route-fields'
import { resolveRouteColumns, resolveActiveRefs } from '@/lib/ref-db'
import { apiErrorResponse } from '@/lib/api-errors'
import { employeeActor } from '@/lib/activity'
import { emitEvent } from '@/lib/events'
import { ciContains } from '@/lib/list-query'

// ─── GET /api/admin/leads — список лидов (В2) ─────────────────
// Query:
//   ?status=new|calculated|won|lost — фильтр по статусу воронки (табы В5;
//   v0.4.0 — табы по-статусные §4.2, D25)
//   ?q= поиск: имя/телефон клиента, контакты rawContact (Json), название
//   груза cargoInfo.cargoName (Json) — v0.4.0 (BRANDBOOK §4.2, эталон Ж4)
//   ?assigned=mine|unassigned|all — фильтр ответственного (P1-01):
//     mine = только мои, unassigned = без ответственного, all = умолчание
//   ?sort=newest|stale — newest (умолчание) свежие сверху; stale —
//     «давно без движения» (updatedAt asc, P1-01)
// Свежие сверху; состав include — как в карточке лида, чтобы списку
// и табам хватило одного запроса.
// v0.4.0: counts — распределение по статусам, считается по ТОМУ ЖЕ
// поиску, но без фильтров таба/ответственного/направления (та же
// семантика, что у заявок: табы показывают распределение найденного,
// а не всей базы).
const LEAD_ASSIGNED_FILTERS = ['mine', 'unassigned', 'all'] as const
const LEAD_LIST_SORTS = ['newest', 'stale'] as const

export async function GET(req: NextRequest) {
  const auth = await requireEmployee(req)
  if (!auth.ok) return auth.response

  const status = req.nextUrl.searchParams.get('status')
  if (status && !(LEAD_STATUSES as readonly string[]).includes(status)) {
    return NextResponse.json({ error: 'Неизвестный статус запроса' }, { status: 400 })
  }

  const assigned = req.nextUrl.searchParams.get('assigned') ?? 'all'
  if (!(LEAD_ASSIGNED_FILTERS as readonly string[]).includes(assigned)) {
    return NextResponse.json({ error: 'Неизвестный фильтр ответственного (assigned)' }, { status: 400 })
  }
  const sort = req.nextUrl.searchParams.get('sort') ?? 'newest'
  if (!(LEAD_LIST_SORTS as readonly string[]).includes(sort)) {
    return NextResponse.json({ error: 'Неизвестная сортировка' }, { status: 400 })
  }

  try {
    const conds: Prisma.LeadWhereInput[] = []
    if (status) conds.push({ status })
    // v0.4.0: поиск ?q= — по клиенту из справочника, сырым контактам
    // (Json rawContact) и названию груза (Json cargoInfo). Лид без номера:
    // менеджер ищет «кто» и «что везём». Json-фильтры — Postgres-only,
    // без mode регистр не важен только для колонок — для Json строки
    // ищем как есть (как в карточке: первое знакомство с лидом).
    // P1-01: mine — «лид веду я»; unassigned — разбор входящих без
    // ответственного (в т.ч. запросы из кабинета И1)
    if (assigned === 'mine') conds.push({ assignedToId: auth.employee.id })
    if (assigned === 'unassigned') conds.push({ assignedToId: null })
    // P1-03: фильтры направления и типа (ILIKE по стране И городу)
    const origin = req.nextUrl.searchParams.get('origin') ?? ''
    const destination = req.nextUrl.searchParams.get('destination') ?? ''
    const transport = req.nextUrl.searchParams.get('transport') ?? ''
    if (transport && !(TRANSPORT_TYPE_CODES as readonly string[]).includes(transport)) {
      return NextResponse.json(
        { error: 'Неизвестный тип перевозки (transport)' },
        { status: 400 }
      )
    }
    const q = req.nextUrl.searchParams.get('q')?.trim() ?? ''
    const search: Prisma.LeadWhereInput | undefined = q
      ? {
          OR: [
            { customer: { name: ciContains(q) } },
            { customer: { phone: ciContains(q) } },
            { rawContact: { path: ['name'], string_contains: q } },
            { rawContact: { path: ['phone'], string_contains: q } },
            { cargoInfo: { path: ['cargoName'], string_contains: q } },
          ],
        }
      : undefined
    if (search) conds.push(search)

    const ci = (v: string) => ({ contains: v, mode: 'insensitive' as const })
    if (origin) {
      conds.push({ OR: [{ originCity: ci(origin) }, { originCountry: ci(origin) }] })
    }
    if (destination) {
      conds.push({ OR: [{ destinationCity: ci(destination) }, { destinationCountry: ci(destination) }] })
    }
    if (transport) conds.push({ transportType: transport as TransportTypeCode })
    const where: Prisma.LeadWhereInput = conds.length ? { AND: conds } : {}

    const [leads, grouped] = await Promise.all([
      db.lead.findMany({
        where,
        // stale — «давно без движения»: старое изменение сверху (P1-01);
        // id — стабильный tie-break, чтобы страницы не дрожали
        orderBy:
          sort === 'stale'
            ? [{ updatedAt: 'asc' }, { id: 'asc' }]
            : [{ createdAt: 'desc' }, { id: 'asc' }],
        include: {
          customer: { select: { id: true, name: true, phone: true } },
          assignee: { select: { id: true, name: true } },
          options: { orderBy: { createdAt: 'asc' } },
          order: { select: { id: true, number: true } },
        },
      }),
      // Счётчики без фильтров таба/ответственного/направления —
      // семантика заявок (v0.4.0, §4.2).
      db.lead.groupBy({
        by: ['status'],
        where: search,
        _count: { _all: true },
      }),
    ])

    const counts: Record<'all' | LeadStatus, number> = {
      all: 0,
      new: 0,
      calculated: 0,
      won: 0,
      lost: 0,
    }
    for (const g of grouped) {
      const n = g._count._all
      counts[g.status as LeadStatus] = n
      counts.all += n
    }

    return NextResponse.json({ leads, counts })
  } catch (e) {
    return apiErrorResponse(e, 'leads GET', 'Не удалось загрузить запросы')
  }
}

// ─── POST /api/admin/leads — создать лид (В2) ─────────────────
// Лид рождается на этапе запроса: либо это уже известный клиент
// (customerId), либо совсем новые контакты (rawContact) — клиента
// заводить заранее не нужно, он родится сам при конвертации (В4).
// cargoInfo — свободная анкета груза (Json без жёсткой формы).
export async function POST(req: NextRequest) {
  const auth = await requireEmployee(req, { write: true })
  if (!auth.ok) return auth.response

  try {
    // Пустое/битое тело — 400, а не 500: req.json() кидает до safeParse.
    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Некорректный JSON в теле запроса' }, { status: 400 })
    }
    const parsed = CreateLeadSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Некорректные данные', details: parsed.error.flatten() },
        { status: 400 }
      )
    }
    const data = parsed.data

    let customerName: string | null = null
    if (data.customerId) {
      const customer = await db.customer.findUnique({
        where: { id: data.customerId },
        select: { id: true, name: true },
      })
      if (!customer) {
        return NextResponse.json({ error: 'Клиент не найден' }, { status: 404 })
      }
      customerName = customer.name
    }

    // Контакт для описания события (Ж2): анкета — сырой Json, имя —
    // единственное поле, которое есть всегда (RawContactSchema).
    const contactName =
      data.rawContact && typeof data.rawContact.name === 'string'
        ? data.rawContact.name
        : null

    // DF-17: коды стран из справочника → валидация + денормализация имён
    // (незнакомый/отключённый код — 400 с текстом).
    const routeResolved = await resolveRouteColumns(data.route)
    if (routeResolved.error) {
      return NextResponse.json({ error: routeResolved.error }, { status: 400 })
    }
    // DF-17: условие поставки — код должен быть в справочнике и активен.
    const incotermResolved = data.incotermCode
      ? await resolveActiveRefs('incoterm', [data.incotermCode])
      : null
    if (incotermResolved && incotermResolved.invalid.length > 0) {
      return NextResponse.json(
        { error: `Условие поставки не найдено в справочнике: ${incotermResolved.invalid.join(', ')}` },
        { status: 400 }
      )
    }

    const lead = await db.lead.create({
      data: {
        status: 'new',
        // P1-01: при создании ответственный — текущий сотрудник (кто
        // принял запрос, тот и ведёт). Запрос из кабинета (И1) создаётся
        // другим роутом без сотрудника — рождается «Без ответственного».
        assignedToId: auth.employee.id,
        ...(data.customerId ? { customerId: data.customerId } : {}),
        // zod-объекты шире Prisma.InputJsonObject — явный каст на
        // границе (тот же приём, что transportModes в В3); без поля
        // колонка остаётся SQL NULL.
        ...(data.rawContact
          ? { rawContact: data.rawContact as unknown as Prisma.InputJsonObject }
          : {}),
        ...(data.cargoInfo
          ? {
              // v: 1 — маркер версии анкеты-rest, ставит сервер (P1-03)
              cargoInfo: {
                ...(data.cargoInfo as Record<string, unknown>),
                v: 1,
              } as unknown as Prisma.InputJsonObject,
            }
          : {}),
        // P1-03/DF-17: маршрут/метрики + коды стран с денормализованными
        // именами (undefined = остаётся NULL, прямые свойства — без спредов-союзов)
        ...routeResolved.columns,
        incotermCode: data.incotermCode ?? null,
      },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        assignee: { select: { id: true, name: true } },
        options: { orderBy: { createdAt: 'asc' } },
        order: { select: { id: true, number: true } },
      },
    })

    // Ж2: журнал — рождение лида (воронка начинается с запроса).
    // DF-01: emitEvent — единственная точка записи, аудитория — из
    // реестра EVENT_TYPES.
    await emitEvent(db, {
      target: { leadId: lead.id },
      actor: employeeActor(auth.employee),
      type: 'lead_created',
      description: customerName
        ? `Запрос создан — клиент: ${customerName}`
        : contactName
          ? `Запрос создан — контакт: ${contactName}`
          : 'Запрос создан',
    })

    return NextResponse.json({ lead, message: 'Запрос создан' }, { status: 201 })
  } catch (e) {
    return apiErrorResponse(e, 'leads POST', 'Не удалось создать запрос')
  }
}
