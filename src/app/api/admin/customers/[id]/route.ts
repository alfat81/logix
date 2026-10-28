import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireEmployee } from '@/lib/auth'
import { summarizeOrderStages, todayUtcMidnight } from '@/lib/orders'
import { apiErrorResponse } from '@/lib/api-errors'

// ─── GET /api/admin/customers/[id] — карточка клиента (Ж6а) ─────
// Всё о клиенте на одном экране: контакты, рамочные договоры (с
// юрлицом и числом заявок), заявки (с ближайшим этапом и просрочкой —
// сводка Ж4 из lib/orders.ts) и лиды воронки. Только чтение: правка
// контактов в периметр Ж6а не входит (очередь просит список и
// карточку), у Customer нет write-семантики, которую стоило бы
// защитить отдельно.
//
// Без пагинации секций: договоров у пары клиент+юрлицо единицы, а
// заявки/лиды клиента — десятки на живой базе, не тысячи; когда
// появятся сотни — списки заявок/лидов уже имеют свои экраны с
// поиском (Ж4, Ж6а-список), карточка остаётся обзором.

// rawContact — толерантный Json (В1): имя читаем мягко, чужую/старую
// структуру молча пропускаем (паттерн readLeadCargo / Ж7-поиск).
function rawContactName(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const v = (raw as Record<string, unknown>).name
  return typeof v === 'string' && v.trim() ? v : null
}

type Params = { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  const auth = await requireEmployee(req)
  if (!auth.ok) return auth.response

  const { id } = await params

  try {
    const customer = await db.customer.findUnique({
      where: { id },
      include: {
        _count: { select: { orders: true, contracts: true, leads: true } },
        // DF-02A Блок 5: «доступ выдан» = есть активный пользователь
        // с паролем (люди — источник входа с Блока 3); Customer.password
        // — зеркало отката, источником правды больше не является.
        users: {
          where: { isActive: true, password: { not: null } },
          select: { id: true },
        },
        contracts: {
          orderBy: { number: 'asc' },
          include: {
            legalEntity: { select: { id: true, name: true } },
            _count: { select: { orders: true } },
          },
        },
        orders: {
          orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
          include: {
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
        },
        leads: {
          orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
          select: {
            id: true,
            status: true,
            createdAt: true,
            updatedAt: true,
            source: true,
            rawContact: true,
            order: { select: { id: true, number: true } },
          },
        },
      },
    })

    if (!customer) {
      return NextResponse.json({ error: 'Клиент не найден' }, { status: 404 })
    }

    // Имена этапов — из каталога (сводка Ж4): код в заявке, имя в справочнике.
    const catalog = await db.orderStageCatalog.findMany({ select: { code: true, name: true } })
    const stageNames = new Map(catalog.map((c) => [c.code, c.name]))
    const todayUtc = todayUtcMidnight()

    return NextResponse.json({
      customer: {
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        email: customer.email,
        comment: customer.comment,
        isActive: customer.isActive,
        createdAt: customer.createdAt,
        // И1: есть ли доступ в кабинет. Сам хеш наружу не отдаём
        // никогда — только булев флаг (паттерн EMPLOYEE_PUBLIC_FIELDS)
        hasCabinetAccess: customer.users.length > 0,
        ordersCount: customer._count.orders,
        contractsCount: customer._count.contracts,
        leadsCount: customer._count.leads,
      },
      contracts: customer.contracts.map((c) => ({
        id: c.id,
        number: c.number,
        signedAt: c.signedAt,
        createdAt: c.createdAt,
        legalEntity: c.legalEntity,
        ordersCount: c._count.orders,
      })),
      orders: customer.orders.map((o) => ({
        id: o.id,
        number: o.number,
        status: o.status,
        createdAt: o.createdAt,
        ...summarizeOrderStages(o.stages, stageNames, todayUtc),
      })),
      leads: customer.leads.map((l) => ({
        id: l.id,
        status: l.status,
        createdAt: l.createdAt,
        updatedAt: l.updatedAt,
        source: l.source,
        // Сырой контакт приоритетнее имени клиента: лид рождается до
        // клиента, и в карточке видно, как представились при обращении.
        contactName: rawContactName(l.rawContact) ?? customer.name,
        order: l.order,
      })),
    })
  } catch (e) {
    return apiErrorResponse(e, 'customer GET', 'Не удалось загрузить клиента')
  }
}
