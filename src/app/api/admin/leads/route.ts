import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { requireEmployee } from '@/lib/auth'
import { CreateLeadSchema, LEAD_STATUSES } from '@/lib/leads'
import { apiErrorResponse } from '@/lib/api-errors'
import { logActivity, employeeActor } from '@/lib/activity'

// ─── GET /api/admin/leads — список лидов (В2) ─────────────────
// Query: ?status=new|calculated|won|lost — фильтр по статусу воронки
// (табы В5). Свежие сверху; состав include — как в карточке лида,
// чтобы списку и табам хватило одного запроса.
export async function GET(req: NextRequest) {
  const auth = await requireEmployee(req)
  if (!auth.ok) return auth.response

  const status = req.nextUrl.searchParams.get('status')
  if (status && !(LEAD_STATUSES as readonly string[]).includes(status)) {
    return NextResponse.json({ error: 'Неизвестный статус лида' }, { status: 400 })
  }

  try {
    const leads = await db.lead.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'desc' },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
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
        ...(data.customerId ? { customerId: data.customerId } : {}),
        // zod-объекты шире Prisma.InputJsonObject — явный каст на
        // границе (тот же приём, что transportModes в В3); без поля
        // колонка остаётся SQL NULL.
        ...(data.rawContact
          ? { rawContact: data.rawContact as unknown as Prisma.InputJsonObject }
          : {}),
        ...(data.cargoInfo
          ? { cargoInfo: data.cargoInfo as unknown as Prisma.InputJsonObject }
          : {}),
      },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
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
