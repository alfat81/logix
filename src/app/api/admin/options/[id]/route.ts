import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireEmployee } from '@/lib/auth'
import { UpdateQuoteOptionSchema } from '@/lib/leads'
import { resolveActiveCurrencies } from '@/lib/ref-db'
import { apiErrorResponse } from '@/lib/api-errors'
import { parseBody } from '@/lib/document-upload'
import { updateOption } from '@/lib/option-edit'
import { emitEvent } from '@/lib/events'
import { employeeActor } from '@/lib/activity'
import { lockLeadForOptions } from '../../leads/[id]/convert/helpers'
import { sumOptionCalc, calcMismatch } from '@/lib/option-calc'
import { diffOptionVsLead } from '@/lib/option-snapshots'

type Params = { params: Promise<{ id: string }> }

// ─── GET /api/admin/options/[id] — вариант целиком (DF-27, план §9) ──
// Staff-проекция: вариант + строки расчёта + итоги + расхождение с
// запросом + ревизии («История варианта»). Строки, итоги и ревизии —
// только сотрудникам (D3 / RULES 2.15): клиентский кабинет читает
// собственную проекцию (CLIENT_OPTION_FIELDS) и этот роут не проходит.
export async function GET(req: NextRequest, { params }: Params) {
  const auth = await requireEmployee(req)
  if (!auth.ok) return auth.response

  const { id } = await params
  try {
    const option = await db.quoteOption.findUnique({
      where: { id },
      include: {
        lead: {
          select: {
            id: true,
            status: true,
            cargoInfo: true,
            wishes: true,
            originCity: true,
            originCountry: true,
            originCountryCode: true,
            destinationCity: true,
            destinationCountry: true,
            destinationCountryCode: true,
            transportType: true,
            readyDate: true,
            incotermCode: true,
            incotermPlace: true,
          },
        },
        calcLines: { orderBy: { sortOrder: 'asc' } },
        revisions: { orderBy: { seq: 'desc' } },
      },
    })
    if (!option) {
      return NextResponse.json({ error: 'Вариант расчёта не найден' }, { status: 404 })
    }

    const { lead, calcLines, revisions, ...optionFields } = option
    const totals = calcLines.length > 0 ? sumOptionCalc(calcLines, option.currency) : null
    return NextResponse.json({
      option: optionFields,
      calcLines,
      calcTotals: totals,
      calcMismatch: calcMismatch(totals, option.costEstimate),
      diffFromLead: diffOptionVsLead(lead, option),
      revisions,
    })
  } catch (e) {
    return apiErrorResponse(e, 'option GET', 'Не удалось загрузить вариант расчёта')
  }
}

// ─── PATCH /api/admin/options/[id] — правка варианта (В3 + DF-27) ──
// DF-27 волна 1: правятся снимки, строки расчёта и коммерческие поля;
// изменённые ключи дописываются в editedFields; в той же транзакции —
// ревизия updated с диффом и (при наличии) ревизия price_review_reset.
// Инвариант «isSelected ровно один на лид» сохранён. won-лид — 409.
// Ответ содержит calcMismatch — предупреждение расхождения суммы строк
// и себестоимости (не ошибка, ТЗ §5).
export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await requireEmployee(req, { write: true })
  if (!auth.ok) return auth.response

  const { id } = await params
  try {
    // Пустое/битое тело — 400, а не 500: разбор+схема — общий parseBody
    // (IC-14: одна точка, DF-27 волна 1).
    const parsed = await parseBody(req, UpdateQuoteOptionSchema)
    if (!parsed.ok) return parsed.response
    const data = parsed.data

    // DF-17: валюты правки — из справочника (активные); null/undefined
    // в проверку не попадает (семантика PATCH «не трогать»)
    const lineCurrencies = (data.calcLines ?? []).map((l) => l.currency)
    if (data.currency !== undefined || data.costCurrency !== undefined || lineCurrencies.length > 0) {
      const currencies = await resolveActiveCurrencies([data.currency, data.costCurrency, ...lineCurrencies])
      if (currencies.invalid.length > 0) {
        return NextResponse.json(
          { error: `Валюта не найдена в справочнике или отключена: ${currencies.invalid.join(', ')}` },
          { status: 400 }
        )
      }
    }

    // Пред-гарды (те же — повторно внутри транзакции с блокировкой)
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
    if (lead && (lead.status === 'won' || lead.order)) {
      return NextResponse.json(
        { error: 'Запрос конвертирован в заявку — варианты расчёта зафиксированы' },
        { status: 409 }
      )
    }
    if (lead && lead.status === 'client_approved') {
      return NextResponse.json(
        { error: 'Согласование активно — сначала сбросьте его действием «Изменить условия»' },
        { status: 409 }
      )
    }

    const result = await updateOption(id, data, auth.employee)
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, ...(result.missing ? { missing: result.missing } : {}) },
        { status: result.status }
      )
    }

    const updatedLead = await db.lead.findUnique({
      where: { id: existing.leadId },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        options: { orderBy: { createdAt: 'asc' } },
        order: { select: { id: true, number: true } },
      },
    })

    return NextResponse.json({
      option: result.option,
      calcTotals: result.calcTotals,
      calcMismatch: result.calcMismatchAmount,
      priceReviewReset: result.priceReviewReset,
      lead: updatedLead,
      message: 'Вариант расчёта обновлён',
    })
  } catch (e) {
    return apiErrorResponse(e, 'option PATCH', 'Не удалось обновить вариант расчёта')
  }
}

// ─── DELETE /api/admin/options/[id] — удалить вариант (В3) ─────
// Удаление НЕ откатывает статус лида (calculated остаётся — статус
// меняет человек через В2 PATCH, не триггер). won-лид — 409.
// Ревизии и строки расчёта уходят каскадом с вариантом (схема DF-27).
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
    if (lead && lead.status === 'client_approved') {
      return NextResponse.json(
        { error: 'Согласование активно — сначала сбросьте его действием «Изменить условия»' },
        { status: 409 }
      )
    }

    // AUD-01: удаление — та же транзакция с блокировкой строки лида
    // и ре-чеком (прецедент lockLeadForOptions), что POST/PATCH
    // (гонка «вариант ↔ конвертация» и гард согласования едины).
    const txResult = await db.$transaction(async (tx) => {
      const guard = await lockLeadForOptions(tx, existing.leadId)
      if (!guard.ok) return guard
      await tx.quoteOption.delete({ where: { id } })

      // Ж5: удаление варианта — тоже движение по лиду.
      await tx.lead.update({ where: { id: existing.leadId }, data: { updatedAt: new Date() } })

      // Ж2: журнал — удаление варианта (описание — до удаления).
      await emitEvent(tx, {
        target: { leadId: existing.leadId },
        actor: employeeActor(auth.employee),
        type: 'option_removed',
        description: `Удалён вариант расчёта: ${existing.description}`,
      })
      return { ok: true as const }
    })
    if (!txResult.ok) {
      return NextResponse.json({ error: txResult.error }, { status: txResult.status })
    }

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
