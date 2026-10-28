import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireEmployee } from '@/lib/auth'
import { hashPassword } from '@/lib/password'
import { normalizePhone } from '@/lib/phone'
import {
  CreateBrokerSchema,
  BROKER_PUBLIC_FIELDS,
} from '@/lib/brokers'
import { apiErrorResponse } from '@/lib/api-errors'
import { CompanyUserError, createBrokerUser } from '@/lib/company-users'

// ─── Справочник брокеров (Д, роадмап 5а) ─────────────────────────
// GET /api/admin/brokers — список. Query: ?active=true|false — витрина
// действующих против деактивированных (фильтр UI); без параметра —
// весь справочник. Свежие сверху.
//
// POST /api/admin/brokers — создать. В отличие от подрядчиков (Г2 —
// рождение из воронки квалификации) у брокеров воронки нет: менеджер
// заводит компанию в справочник напрямую, сразу с логином портала.
// DELETE не существует вовсе (как у подрядчиков Г3 и сотрудников Ж6в):
// история сделок не теряет участников, «удаление» = isActive=false
// через PATCH /[id].
//
// Аудит Ж2 не пишется: у событий справочника нет цели «заявка/лид»
// (решение Ж6в об аудите доступа действует и здесь).
export async function GET(req: NextRequest) {
  const auth = await requireEmployee(req)
  if (!auth.ok) return auth.response

  const active = req.nextUrl.searchParams.get('active')
  if (active !== null && active !== 'true' && active !== 'false') {
    return NextResponse.json(
      { error: 'Параметр active принимает только true или false' },
      { status: 400 }
    )
  }

  try {
    const brokers = await db.broker.findMany({
      where: active !== null ? { isActive: active === 'true' } : undefined,
      orderBy: { createdAt: 'desc' },
      select: {
        ...BROKER_PUBLIC_FIELDS,
        // Сколько сделок сейчас видит брокер: лиды в расчёте + заявки.
        // Деактивированному сразу видно, что связи живы (мягкой
        // чистки нет — связи не рвутся, доступ гасит broker-auth).
        _count: { select: { leadLinks: true, orderLinks: true } },
      },
    })

    return NextResponse.json({ brokers })
  } catch (e) {
    return apiErrorResponse(e, 'brokers GET', 'Не удалось загрузить справочник брокеров')
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireEmployee(req, { write: true })
  if (!auth.ok) return auth.response

  try {
    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Некорректный JSON в теле запроса' }, { status: 400 })
    }
    const parsed = CreateBrokerSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Некорректные данные', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    // Телефон обязан нормализоваться — логин портала (нормализует
    // вход и иначе не пускает). Паттерн сотрудников Ж6в: мертворожден
    // ных учёток с сырым иностранным номером не плодим.
    const phone = normalizePhone(parsed.data.phone)
    if (!phone) {
      return NextResponse.json(
        {
          error:
            'Телефон — логин портала: укажите российский номер, который приводится к +7XXXXXXXXXX',
        },
        { status: 400 }
      )
    }

    const phoneOwner = await db.broker.findUnique({
      where: { phone },
      select: { companyName: true },
    })
    if (phoneOwner) {
      return NextResponse.json(
        { error: `Телефон уже используется брокером «${phoneOwner.companyName}» — укажите другой` },
        { status: 409 }
      )
    }

    // DF-02A: брокер рождается сразу с основным пользователем — источник
    // входа с этого релиза (имя — название компании, телефон/пароль —
    // те же учётные данные; createBrokerUser хеширует сам, проверит
    // глобальную уникальность телефона среди пользователей брокера).
    // Старое поле Broker.password остаётся (DEPRECATIONS, страховка
    // отката до contract-релиза).
    const broker = await db.$transaction(async (tx) => {
      const created = await tx.broker.create({
        data: {
          companyName: parsed.data.companyName,
          phone,
          password: hashPassword(parsed.data.password),
          isInHouse: parsed.data.isInHouse ?? false,
          ...(parsed.data.comment !== undefined && parsed.data.comment !== null
            ? { comment: parsed.data.comment }
            : {}),
          ...(parsed.data.contactInfo
            ? { contactInfo: parsed.data.contactInfo as object }
            : {}),
        },
        select: BROKER_PUBLIC_FIELDS,
      })
      await createBrokerUser(tx, created.id, {
        name: created.companyName,
        phone,
        password: parsed.data.password,
        isPrimary: true,
      })
      return created
    })

    return NextResponse.json({ broker }, { status: 201 })
  } catch (e) {
    if (e instanceof CompanyUserError) {
      return NextResponse.json({ error: e.message }, { status: e.status })
    }
    return apiErrorResponse(e, 'brokers POST', 'Не удалось создать брокера')
  }
}
