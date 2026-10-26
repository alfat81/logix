import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { requireEmployee } from '@/lib/auth'
import {
  ConvertLeadSchema,
  RawContactSchema,
  LEAD_STATUS_LABELS,
} from '@/lib/leads'
import { createOrderWithStages, findOrCreateCustomer } from '@/lib/orders'
import { carryDocumentsToOrder } from '@/lib/documents'
import { normalizePhone } from '@/lib/phone'
import { apiErrorResponse } from '@/lib/api-errors'
import { logActivity, employeeActor } from '@/lib/activity'
import { carryBrokersToOrder, loadLeadCard } from './helpers'

type Params = { params: Promise<{ id: string }> }

// ─── POST /api/admin/leads/[id]/convert — атомарная конвертация в заявку (В4 + DF-00) ──
//
// Финальный шаг воронки: выбранный вариант расчёта превращается в заявку.
// DF-00 (0.5.1): все действия (клиент, заявка, этапы, перевод лида в won,
// перенос брокеров, перенос документов, логи в обе ленты) объединены в ОДНУ
// интерактивную транзакцию db.$transaction с таймаутом 15с.
// Ветка самовосстановления убрана: полусконвертированных лидов не бывает.
export async function POST(req: NextRequest, { params }: Params) {
  const auth = await requireEmployee(req, { write: true })
  if (!auth.ok) return auth.response

  const { id } = await params
  try {
    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Некорректный JSON в теле запроса' }, { status: 400 })
    }
    const parsed = ConvertLeadSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Некорректные данные', details: parsed.error.flatten() },
        { status: 400 }
      )
    }
    const { legalEntityId, incoterm, hsCode } = parsed.data

    const lead = await db.lead.findUnique({
      where: { id },
      include: {
        options: { orderBy: { createdAt: 'asc' } },
        order: { select: { id: true, number: true } },
      },
    })
    if (!lead) {
      return NextResponse.json({ error: 'Запрос не найден' }, { status: 404 })
    }

    // Повторная конвертация — чистый 409
    if (lead.order) {
      return NextResponse.json(
        { error: `Запрос уже конвертирован в заявку №${lead.order.number}` },
        { status: 409 }
      )
    }
    if (lead.status === 'won') {
      return NextResponse.json(
        { error: 'Запрос уже конвертирован в заявку — статус терминальный' },
        { status: 409 }
      )
    }
    if (lead.status === 'lost') {
      return NextResponse.json(
        { error: 'Запрос в отказе — сначала верните его в работу (PATCH status), затем конвертируйте' },
        { status: 409 }
      )
    }

    // Выбранный вариант
    const selected = lead.options.find((o) => o.isSelected)
    if (!selected) {
      return NextResponse.json(
        { error: 'Выберите вариант расчёта (isSelected) — конвертировать без него нельзя' },
        { status: 409 }
      )
    }

    // Проверка юрлица
    const legalEntity = await db.legalEntity.findUnique({
      where: { id: legalEntityId },
      select: { id: true },
    })
    if (!legalEntity) {
      return NextResponse.json({ error: 'Юрлицо не найдено' }, { status: 404 })
    }

    // Снимок выбранного расчёта для заявки
    const quoteSnapshot: Prisma.InputJsonObject = {
      description: selected.description,
      price: selected.price.toNumber(),
      currency: selected.currency,
      vatMode: selected.vatMode,
      etaDays: selected.etaDays,
      priorityFit: selected.priorityFit,
      ...(Array.isArray(selected.transportModes)
        ? { transportModes: selected.transportModes.filter((m) => typeof m === 'string') }
        : {}),
    }

    // Контакты для заведения клиента при отсутствии customerId
    let rawPhone: string | null = null
    let rawName = ''
    let rawEmail: string | null = null
    if (!lead.customerId) {
      const raw = RawContactSchema.safeParse(lead.rawContact)
      if (!raw.success) {
        return NextResponse.json(
          { error: 'Анкета запроса (rawContact) некорректна — нет контактов для заведения клиента' },
          { status: 400 }
        )
      }
      rawName = raw.data.name
      rawPhone = raw.data.phone ? (normalizePhone(raw.data.phone) ?? raw.data.phone.trim()) : null
      rawEmail = raw.data.email ?? null
    }

    // ── Единая интерактивная транзакция DF-00 ─────────────────────────────
    const result = await db.$transaction(
      async (tx) => {
        // Блокировка строки лида
        await tx.$queryRaw`SELECT id FROM "Lead" WHERE id = ${id} FOR UPDATE`
        const locked = await tx.lead.findUnique({
          where: { id },
          include: { order: { select: { id: true, number: true } } },
        })
        if (!locked) return { error: 'Запрос не найден', status: 404 }
        if (locked.order || locked.status === 'won') {
          return {
            error: `Запрос уже конвертирован в заявку №${locked.order?.number ?? ''}`,
            status: 409,
          }
        }

        // 1. Клиент: find-or-create под блокировкой
        const customer = locked.customerId
          ? await findOrCreateCustomer({ customerId: locked.customerId }, tx)
          : await findOrCreateCustomer({ name: rawName, phone: rawPhone, email: rawEmail }, tx)
        if ('error' in customer) return customer

        if (locked.customerId !== customer.id) {
          await tx.lead.update({ where: { id }, data: { customerId: customer.id } })
        }

        // 2. Создание заявки с этапами (внутри блокируется строка Contract)
        const orderRes = await createOrderWithStages(
          {
            customerId: customer.id,
            legalEntityId,
            incoterm: incoterm || null,
            hsCode: hsCode || null,
            leadId: locked.id,
            assignedToId: locked.assignedToId ?? auth.employee.id,
            cargoInfo: (locked.cargoInfo as Prisma.InputJsonObject | null) ?? undefined,
            route: {
              originCity: locked.originCity,
              originCountry: locked.originCountry,
              destinationCity: locked.destinationCity,
              destinationCountry: locked.destinationCountry,
              transportType: locked.transportType,
              readyDate: locked.readyDate,
              weightKg: locked.weightKg,
              volumeM3: locked.volumeM3,
              placesCount: locked.placesCount,
            },
            quoteSnapshot,
          },
          tx
        )
        if ('error' in orderRes) return orderRes

        // 3. Перевод лида в won
        await tx.lead.update({ where: { id }, data: { status: 'won' } })

        // 4. Перенос брокеров
        const carriedBrokers = await carryBrokersToOrder(id, orderRes.id, tx)

        // 5. Перенос документов
        const carriedDocs = await carryDocumentsToOrder(id, orderRes.id, tx)

        // 6. Аудит в обе ленты событий
        await logActivity(
          { leadId: id },
          employeeActor(auth.employee),
          'lead_converted',
          `Сконвертирован в заявку №${orderRes.number}` +
            (carriedBrokers > 0 ? ` — брокеры перенесены: ${carriedBrokers}` : '') +
            (carriedDocs > 0 ? `, документы перенесены: ${carriedDocs}` : ''),
          tx
        )
        await logActivity(
          { orderId: orderRes.id },
          employeeActor(auth.employee),
          'order_created',
          `Заявка №${orderRes.number} создана конвертацией из запроса — груз и условия скопированы снимком` +
            (carriedBrokers > 0 ? `, брокеры видимости: ${carriedBrokers}` : '') +
            (carriedDocs > 0 ? `, документы: ${carriedDocs}` : ''),
          tx
        )

        return {
          order: { id: orderRes.id, number: orderRes.number },
          customerBorn: customer.created,
        }
      },
      { timeout: 15000, maxWait: 5000 }
    )

    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    const updatedLead = await loadLeadCard(id)
    return NextResponse.json(
      {
        order: result.order,
        lead: updatedLead,
        customerBorn: result.customerBorn,
        message: `Заявка №${result.order.number} создана — статус запроса: ${LEAD_STATUS_LABELS.won}`,
      },
      { status: 201 }
    )
  } catch (e) {
    return apiErrorResponse(e, 'lead convert', 'Не удалось конвертировать запрос в заявку')
  }
}
