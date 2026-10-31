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
import { resolveActiveRefs } from '@/lib/ref-db'
import { carryDocumentsToOrder } from '@/lib/documents'
import { carryPermitsToOrder } from '@/lib/permits-db'
import { normalizePhone } from '@/lib/phone'
import { apiErrorResponse } from '@/lib/api-errors'
import { employeeActor } from '@/lib/activity'
import { emitEvent } from '@/lib/events'
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
    const { legalEntityId, incoterm, incotermCode, hsCode } = parsed.data

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

    // DF-17: условие поставки — код из справочника приоритетен над
    // легаси-текстом; код должен быть в справочнике и активен.
    // DF-23 (а): тело приоритетно, но прямой API-вызов без кода в теле
    // больше НЕ теряет выбор клиента из запроса молча — пусто в теле →
    // код с лида. Явный null в теле (менеджер стёр предзаполнение
    // диалога) остаётся осознанной очисткой.
    const effectiveIncotermCode =
      incotermCode !== undefined ? (incotermCode ?? null) : (lead.incotermCode ?? null)
    if (effectiveIncotermCode) {
      const incotermResolved = await resolveActiveRefs('incoterm', [effectiveIncotermCode])
      if (incotermResolved.invalid.length > 0) {
        return NextResponse.json(
          { error: `Условие поставки не найдено в справочнике: ${incotermResolved.invalid.join(', ')}` },
          { status: 400 }
        )
      }
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
        // DF-23 (в): ТН ВЭД — одна точка правки: бланк анкеты (cargoInfo
        // с заблокированной строки) — источник правды, колонка hsCode
        // следует за ним. Код в теле (диалог, предзаполнен бланком) — это
        // правка кода В снимке бланка заявки; пусто в теле → колонка из
        // бланка (прямой API-вызов молча не теряет код анкеты), явный
        // null → код снимается с бланка заявки.
        const leadBlank = (locked.cargoInfo as Prisma.InputJsonObject | null) ?? null
        const blankHs = (() => {
          const v = (leadBlank as Record<string, unknown> | null)?.hsCode
          return typeof v === 'string' && v.trim() ? v.trim() : null
        })()
        const effectiveHsCode = hsCode !== undefined ? (hsCode || null) : blankHs
        const cargoSnapshot: Prisma.InputJsonObject | undefined = leadBlank
          ? hsCode !== undefined
            ? { ...leadBlank, hsCode: effectiveHsCode }
            : leadBlank
          : effectiveHsCode
            ? { v: 1, hsCode: effectiveHsCode }
            : undefined

        const orderRes = await createOrderWithStages(
          {
            customerId: customer.id,
            legalEntityId,
            // DF-17: код приоритетен; легаси-текст — снимок для старых отображений
            incoterm: effectiveIncotermCode ?? (incoterm || null),
            incotermCode: effectiveIncotermCode,
            // DF-19/DF-23 (а): место условия поставки — переносится с лида
            // (было: колонка заявки всегда пустая — потеря данных)
            incotermPlace: locked.incotermPlace,
            hsCode: effectiveHsCode,
            leadId: locked.id,
            assignedToId: locked.assignedToId ?? auth.employee.id,
            cargoInfo: cargoSnapshot,
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
              // DF-17: коды стран переносятся с лида снимком
              originCountryCode: locked.originCountryCode,
              destinationCountryCode: locked.destinationCountryCode,
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

        // 5а. DF-16: перенос обязательств по разрешительным (лид → заявка)
        const carriedPermits = await carryPermitsToOrder(id, orderRes.id, tx)

        // 6. Аудит в обе ленты событий
        await emitEvent(tx, {
          target: { leadId: id },
          actor: employeeActor(auth.employee),
          type: 'lead_converted',
          description: `Сконвертирован в заявку №${orderRes.number}` +
            (carriedBrokers > 0 ? ` — брокеры перенесены: ${carriedBrokers}` : '') +
            (carriedDocs > 0 ? `, документы перенесены: ${carriedDocs}` : '') +
            (carriedPermits > 0 ? `, разрешительные перенесены: ${carriedPermits}` : ''),
        })
        await emitEvent(tx, {
          target: { orderId: orderRes.id },
          actor: employeeActor(auth.employee),
          type: 'order_created',
          description: `Заявка №${orderRes.number} создана конвертацией из запроса — груз и условия скопированы снимком` +
            (carriedBrokers > 0 ? `, брокеры видимости: ${carriedBrokers}` : '') +
            (carriedDocs > 0 ? `, документы: ${carriedDocs}` : '') +
            (carriedPermits > 0 ? `, разрешительные: ${carriedPermits}` : ''),
        })

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
