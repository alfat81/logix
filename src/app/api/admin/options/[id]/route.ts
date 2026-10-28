import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { requireEmployee } from '@/lib/auth'
import { UpdateQuoteOptionSchema } from '@/lib/leads'
import { resolveActiveCurrencies } from '@/lib/ref-db'
import { apiErrorResponse } from '@/lib/api-errors'
import { employeeActor } from '@/lib/activity'
import { emitEvent } from '@/lib/events'

type Params = { params: Promise<{ id: string }> }

// ─── PATCH /api/admin/options/[id] — правка варианта (В3) ──────
// Любое подмножество полей. Инвариант «isSelected ровно один на лид»:
// выбор этого варианта (isSelected:true) снимает отметку с прежнего в
// одной транзакции; явное isSelected:false допустимо (осознанное снятие
// выбора до нуля) — выбирать новый вариант не обязательно.
// won-лид — 409: варианты зафиксированы историей сделки.
export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await requireEmployee(req, { write: true })
  if (!auth.ok) return auth.response

  const { id } = await params
  try {
    // Пустое/битое тело — 400, а не 500: req.json() кидает до safeParse.
    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Некорректный JSON в теле запроса' }, { status: 400 })
    }
    const parsed = UpdateQuoteOptionSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Некорректные данные', details: parsed.error.flatten() },
        { status: 400 }
      )
    }
    const data = parsed.data

    // DF-17: валюты правки — из справочника (активные); null/undefined
    // в проверку не попадает (семантика PATCH «не трогать»)
    if (data.currency !== undefined || data.costCurrency !== undefined) {
      const currencies = await resolveActiveCurrencies([data.currency, data.costCurrency])
      if (currencies.invalid.length > 0) {
        return NextResponse.json(
          { error: `Валюта не найдена в справочнике или отключена: ${currencies.invalid.join(', ')}` },
          { status: 400 }
        )
      }
    }

    const existing = await db.quoteOption.findUnique({
      where: { id },
      include: { lead: { select: { id: true, status: true } } },
    })
    if (!existing) {
      return NextResponse.json({ error: 'Вариант расчёта не найден' }, { status: 404 })
    }

    const lead = await db.lead.findUnique({
      where: { id: existing.leadId },
      include: { order: { select: { id: true } } },
    })
    // «won» — терминальный (В2): правка вариантов после конвертации —
    // правка истории, не через API.
    if (lead && (lead.status === 'won' || lead.order)) {
      return NextResponse.json(
        { error: 'Запрос конвертирован в заявку — варианты расчёта зафиксированы' },
        { status: 409 }
      )
    }

    // Интерактивная транзакция (не массивная — урок В3 про позиционность
    // условных spread-элементов): сначала снять отметку с прежнего, затем
    // править сам вариант — «ровно один» держится и внутри транзакции.
    const option = await db.$transaction(async (tx) => {
      if (data.isSelected) {
        await tx.quoteOption.updateMany({
          where: { leadId: existing.leadId, isSelected: true, id: { not: id } },
          data: { isSelected: false },
        })
      }
      const updated = await tx.quoteOption.update({
        where: { id },
        data: {
          ...(data.description !== undefined ? { description: data.description } : {}),
          ...(data.transportModes !== undefined
            ? {
                transportModes:
                  data.transportModes as unknown as Prisma.InputJsonArray,
              }
            : {}),
          // P1-04: цена/валюта/НДС; costEstimate: null — очистить
          // себестоимость (не передан — не трогаем)
          ...(data.price !== undefined ? { price: data.price } : {}),
          ...(data.currency !== undefined ? { currency: data.currency } : {}),
          ...(data.vatMode !== undefined ? { vatMode: data.vatMode } : {}),
          ...(data.costEstimate !== undefined ? { costEstimate: data.costEstimate } : {}),
          ...(data.costCurrency !== undefined ? { costCurrency: data.costCurrency } : {}),
          ...(data.etaDays !== undefined ? { etaDays: data.etaDays } : {}),
          ...(data.priorityFit !== undefined ? { priorityFit: data.priorityFit } : {}),
          ...(data.isSelected !== undefined ? { isSelected: data.isSelected } : {}),
        },
      })
      // Ж5: правка варианта — движение по лиду (сброс маркера «без
      // движения»): сам вариант таблицу лида не трогает.
      await tx.lead.update({ where: { id: existing.leadId }, data: { updatedAt: new Date() } })
      // Ж2: журнал — выбор и правка отдельными записями (выбор — это
      // решение, правка — уточнение данных), в той же транзакции.
      if (data.isSelected === true) {
        await emitEvent(tx, {
          target: { leadId: existing.leadId },
          actor: employeeActor(auth.employee),
          type: 'option_selected',
          description: `Выбран вариант расчёта: ${data.description ?? existing.description}`,
        })
      }
      const fieldsTouched =
        data.description !== undefined ||
        data.transportModes !== undefined ||
        data.price !== undefined ||
        data.currency !== undefined ||
        data.vatMode !== undefined ||
        data.costEstimate !== undefined ||
        data.costCurrency !== undefined ||
        data.etaDays !== undefined ||
        data.priorityFit !== undefined
      if (fieldsTouched) {
        await emitEvent(tx, {
          target: { leadId: existing.leadId },
          actor: employeeActor(auth.employee),
          type: 'option_updated',
          description: `Обновлён вариант расчёта: ${data.description ?? existing.description}`,
        })
      }
      return updated
    })

    // Свежий лид с полным составом вариантов — В5-карточке не нужен
    // повторный GET после правки.
    const updatedLead = await db.lead.findUnique({
      where: { id: existing.leadId },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        options: { orderBy: { createdAt: 'asc' } },
        order: { select: { id: true, number: true } },
      },
    })

    return NextResponse.json({ option, lead: updatedLead, message: 'Вариант расчёта обновлён' })
  } catch (e) {
    return apiErrorResponse(e, 'option PATCH', 'Не удалось обновить вариант расчёта')
  }
}

// ─── DELETE /api/admin/options/[id] — удалить вариант (В3) ─────
// Удаление НЕ откатывает статус лида (calculated остаётся — статус
// меняет человек через В2 PATCH, не триггер). won-лид — 409.
export async function DELETE(req: NextRequest, { params }: Params) {
  const auth = await requireEmployee(req, { write: true })
  if (!auth.ok) return auth.response

  const { id } = await params
  try {
    const existing = await db.quoteOption.findUnique({
      where: { id },
      select: { id: true, leadId: true, description: true },
    })
    if (!existing) {
      return NextResponse.json({ error: 'Вариант расчёта не найден' }, { status: 404 })
    }

    const lead = await db.lead.findUnique({
      where: { id: existing.leadId },
      include: { order: { select: { id: true } } },
    })
    if (lead && (lead.status === 'won' || lead.order)) {
      return NextResponse.json(
        { error: 'Запрос конвертирован в заявку — варианты расчёта зафиксированы' },
        { status: 409 }
      )
    }

    await db.quoteOption.delete({ where: { id } })

    // Ж5: удаление варианта — тоже движение по лиду.
    await db.lead.update({ where: { id: existing.leadId }, data: { updatedAt: new Date() } })

    // Ж2: журнал — удаление варианта (описание — до удаления).
    await emitEvent(db, {
      target: { leadId: existing.leadId },
      actor: employeeActor(auth.employee),
      type: 'option_removed',
      description: `Удалён вариант расчёта: ${existing.description}`,
    })

    const updatedLead = await db.lead.findUnique({
      where: { id: existing.leadId },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        options: { orderBy: { createdAt: 'asc' } },
        order: { select: { id: true, number: true } },
      },
    })

    return NextResponse.json({ ok: true, lead: updatedLead, message: 'Вариант расчёта удалён' })
  } catch (e) {
    return apiErrorResponse(e, 'option DELETE', 'Не удалось удалить вариант расчёта')
  }
}
