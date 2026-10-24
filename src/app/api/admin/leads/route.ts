import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { requireEmployee } from '@/lib/auth'
import { CreateLeadSchema, LEAD_STATUSES } from '@/lib/leads'
import {
  readyDateInput,
  TRANSPORT_TYPE_CODES,
  type TransportTypeCode,
} from '@/lib/route-fields'
import { apiErrorResponse } from '@/lib/api-errors'
import { logActivity, employeeActor } from '@/lib/activity'

// ─── GET /api/admin/leads — список лидов (В2) ─────────────────
// Query:
//   ?status=new|calculated|won|lost — фильтр по статусу воронки (табы В5)
//   ?assigned=mine|unassigned|all — фильтр ответственного (P1-01):
//     mine = только мои, unassigned = без ответственного, all = умолчание
//   ?sort=newest|stale — newest (умолчание) свежие сверху; stale —
//     «давно без движения» (updatedAt asc, P1-01)
// Свежие сверху; состав include — как в карточке лида, чтобы списку
// и табам хватило одного запроса.
const LEAD_ASSIGNED_FILTERS = ['mine', 'unassigned', 'all'] as const
const LEAD_LIST_SORTS = ['newest', 'stale'] as const

export async function GET(req: NextRequest) {
  const auth = await requireEmployee(req)
  if (!auth.ok) return auth.response

  const status = req.nextUrl.searchParams.get('status')
  if (status && !(LEAD_STATUSES as readonly string[]).includes(status)) {
    return NextResponse.json({ error: 'Неизвестный статус лида' }, { status: 400 })
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
    const ci = (v: string) => ({ contains: v, mode: 'insensitive' as const })
    if (origin) {
      conds.push({ OR: [{ originCity: ci(origin) }, { originCountry: ci(origin) }] })
    }
    if (destination) {
      conds.push({ OR: [{ destinationCity: ci(destination) }, { destinationCountry: ci(destination) }] })
    }
    if (transport) conds.push({ transportType: transport as TransportTypeCode })
    const where: Prisma.LeadWhereInput = conds.length ? { AND: conds } : {}

    const leads = await db.lead.findMany({
      where,
      // stale — «давно без движения»: старое изменение сверху (P1-01);
      // id — стабильный tie-break, чтобы страницы не дрожали
      orderBy: sort === 'stale' ? [{ updatedAt: 'asc' }, { id: 'asc' }] : [{ createdAt: 'desc' }, { id: 'asc' }],
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        assignee: { select: { id: true, name: true } },
        options: { orderBy: { createdAt: 'asc' } },
        order: { select: { id: true, number: true } },
      },
    })

    return NextResponse.json({ leads })
  } catch (e) {
    return apiErrorResponse(e, 'leads GET', 'Не удалось загрузить лиды')
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
        // P1-03: маршрут/метрики — колонки (undefined = остаётся NULL,
        // прямые свойства — без спредов-союзов)
        originCity: data.route?.originCity,
        originCountry: data.route?.originCountry,
        destinationCity: data.route?.destinationCity,
        destinationCountry: data.route?.destinationCountry,
        transportType: data.route?.transportType,
        readyDate: data.route ? readyDateInput(data.route.readyDate) : undefined,
        weightKg: data.route?.weightKg,
        volumeM3: data.route?.volumeM3,
        placesCount: data.route?.placesCount,
      },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        assignee: { select: { id: true, name: true } },
        options: { orderBy: { createdAt: 'asc' } },
        order: { select: { id: true, number: true } },
      },
    })

    // Ж2: журнал — рождение лида (воронка начинается с запроса).
    await logActivity(
      { leadId: lead.id },
      employeeActor(auth.employee),
      'lead_created',
      customerName
        ? `Лид создан — клиент: ${customerName}`
        : contactName
          ? `Лид создан — контакт: ${contactName}`
          : 'Лид создан',
    )

    return NextResponse.json({ lead, message: 'Лид создан' }, { status: 201 })
  } catch (e) {
    return apiErrorResponse(e, 'leads POST', 'Не удалось создать лид')
  }
}
