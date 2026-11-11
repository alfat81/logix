import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import type { CurrentEmployee } from '@/lib/auth'
import { emitEvent } from '@/lib/events'
import { formatMoneyWithVat, type VatModeCode } from '@/lib/money'
import { LEAD_STATUS_LABELS, type CreateQuoteOptionInput, type OptionCalcLineInput } from '@/lib/leads'
import {
  buildOptionSnapshots,
  applyOverrides,
  completeness,
  diffOptionVsLead,
} from '@/lib/option-snapshots'
import { computeAmountOffer, sumOptionCalc, type OptionCalcTotals } from '@/lib/option-calc'
import { recordOptionRevision } from '@/lib/option-revisions'
import { applyAutoLeadStatus, type AutoStatusResult } from '@/lib/lead-auto-status'
import type { LeadStatus } from '@/lib/leads'

// ─── DF-27 волна 1: серверная логика создания варианта и «Заполнить
// из запроса» (план v1.2 §3–§4, §9). Роуты остаются тонкими (RULES 2.5,
// лимит 300 строк — RULES 2.14). Все записи — в одной транзакции с
// блокировкой строки лида (AUD-01, прецедент lockLeadForOptions).

// Актёр вариантов — сотрудник (конкретный член union ActivityActor:
// emitEvent принимает его структурно, ревизии — по полям)
export type OptionActor = { type: 'employee'; id: string; name: string }

// Полный бланк лида для сборки снимков (колонки P1-03/DF-17/DF-19 +
// cargoInfo + wishes)
const LEAD_BLANK_SELECT = {
  id: true,
  status: true,
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
  weightKg: true,
  volumeM3: true,
  placesCount: true,
  cargoInfo: true,
  wishes: true,
} as const

type LeadBlank = Prisma.LeadGetPayload<{ select: typeof LEAD_BLANK_SELECT }>

export async function loadLeadBlank(
  tx: Prisma.TransactionClient,
  leadId: string
): Promise<LeadBlank | null> {
  return tx.lead.findUnique({ where: { id: leadId }, select: LEAD_BLANK_SELECT })
}

export function employeeActorOf(employee: CurrentEmployee): OptionActor {
  return { type: 'employee', id: employee.id, name: employee.name }
}

// Подготовка строк расчёта к записи: amountOffer по валюте предложения
// (computeAmountOffer); existence-проверка ссылки на версию таможенного
// расчёта — здесь (транзакционный контекст).
export async function prepareCalcLines(
  tx: Prisma.TransactionClient,
  lines: OptionCalcLineInput[] | undefined,
  offerCurrency: string
): Promise<
  | { ok: true; rows: Array<Omit<Prisma.QuoteOptionCalcLineCreateManyInput, 'optionId'>> }
  | { ok: false; error: string }
> {
  if (!lines || lines.length === 0) return { ok: true, rows: [] }
  for (const line of lines) {
    if (line.customsCalculationId) {
      const exists = await tx.customsCalculation.findUnique({
        where: { id: line.customsCalculationId },
        select: { id: true },
      })
      if (!exists) return { ok: false, error: 'Ссылка на версию таможенного расчёта не найдена' }
    }
  }
  const rows = lines.map((line, index) => {
    const offer = computeAmountOffer(line.amount, line.currency, line.fxRateToOffer ?? null, offerCurrency)
    return {
      sortOrder: index,
      article: line.article,
      title: line.title ?? null,
      amount: line.amount,
      currency: line.currency,
      fxRateToOffer: offer.fxRateToOffer,
      amountOffer: offer.amountOffer,
      source: line.source,
      customsCalculationId: line.customsCalculationId ?? null,
      comment: line.comment ?? null,
    }
  })
  return { ok: true, rows }
}

export type CreateOptionResult =
  | { ok: false; status: number; error: string; missing?: string[] }
  | {
      ok: true
      option: Record<string, unknown>
      calcTotals: OptionCalcTotals | null
      // DF-27 волна 2: автомат статуса — фактический переход (может быть
      // и needs_data → calculated, и new → calculated)
      statusChange: AutoStatusResult
      isPreliminary: boolean
      missing: string[]
    }

// Создание варианта (POST): снимки строятся автоматически из запроса,
// overrides уходят в editedFields; при незакрытых критичных параметрах —
// только с isPreliminary=true и фактическим missingData (422 без него);
// ревизия created и событие option_added — в той же транзакции.
export async function createOption(
  leadId: string,
  data: CreateQuoteOptionInput,
  employee: CurrentEmployee
): Promise<CreateOptionResult> {
  const actor = employeeActorOf(employee)
  const txResult = await db.$transaction(async (tx) => {
    const locked = await tx.lead.findUnique({
      where: { id: leadId },
      select: { id: true, status: true },
    })
    if (!locked) return { ok: false as const, status: 404, error: 'Запрос не найден' }
    const lead = await loadLeadBlank(tx, leadId)
    if (!lead) return { ok: false as const, status: 404, error: 'Запрос не найден' }

    const lines = await prepareCalcLines(tx, data.calcLines, data.currency)
    if (!lines.ok) return { ok: false as const, status: 400, error: lines.error }

    // Снимки: base из запроса + overrides (ТЗ §3.3–3.4)
    const base = buildOptionSnapshots(lead)
    const applied = applyOverrides(base, {
      route: data.route as Record<string, unknown> | undefined,
      cargo: data.cargo,
      routeStops: data.routeStops as unknown[] | null | undefined,
      wishes: data.wishes,
    })

    // Полнота (ТЗ §5.1–5.3): эффективный вид «запрос + снимки варианта»
    const eff = completeness(lead, {
      routeSnapshot: applied.routeSnapshot,
      cargoSnapshot: applied.cargoSnapshot,
    })
    const isPreliminary = data.isPreliminary ?? false
    if (eff.missing.length > 0 && !isPreliminary) {
      return { ok: false as const, status: 422, error: 'Заполните недостающие данные или сохраните вариант как предварительный расчёт', missing: eff.missing }
    }

    if (data.isSelected) {
      await tx.quoteOption.updateMany({
        where: { leadId, isSelected: true },
        data: { isSelected: false },
      })
    }
    const created = await tx.quoteOption.create({
      data: {
        leadId,
        description: data.description,
        ...(data.transportModes
          ? { transportModes: data.transportModes as unknown as Prisma.InputJsonArray }
          : {}),
        price: data.price,
        currency: data.currency,
        vatMode: data.vatMode,
        ...(data.costEstimate !== undefined ? { costEstimate: data.costEstimate } : {}),
        costCurrency: data.costCurrency,
        etaDays: data.etaDays,
        priorityFit: data.priorityFit,
        isSelected: data.isSelected ?? false,
        routeSnapshot: applied.routeSnapshot as unknown as Prisma.InputJsonObject,
        cargoSnapshot: applied.cargoSnapshot as unknown as Prisma.InputJsonObject,
        ...(applied.routeStops !== null
          ? { routeStops: applied.routeStops as unknown as Prisma.InputJsonArray }
          : {}),
        sourceFields: applied.sourceFields as unknown as Prisma.InputJsonArray,
        editedFields: applied.editedFields as unknown as Prisma.InputJsonArray,
        isPreliminary,
        ...(eff.missing.length > 0
          ? { missingData: { v: 1, missing: eff.missing } as unknown as Prisma.InputJsonObject }
          : {}),
        updatedById: employee.id,
        updatedByName: employee.name,
      },
    })
    if (lines.rows.length > 0) {
      await tx.quoteOptionCalcLine.createMany({
        data: lines.rows.map((r) => ({ ...r, optionId: created.id })),
      })
    }
    // Ревизия created (план §4.2) — перечень overrides, дифф-состав
    await recordOptionRevision(tx, {
      optionId: created.id,
      kind: 'created',
      actor: { type: actor.type, id: actor.id, name: actor.name },
      changedFields: {
        ...(applied.editedFields.length > 0
          ? { editedFields: { from: null, to: applied.editedFields } }
          : {}),
        ...(isPreliminary ? { isPreliminary: { from: null, to: true } } : {}),
      },
    })
    // Автомат статуса (§6.4/D75): полнота по АНКЕТЕ ЗАПРОСА в состоянии-после создания варианта
    const optionsCount = await tx.quoteOption.count({ where: { leadId } })
    const statusChange = await applyAutoLeadStatus(
      tx,
      leadId,
      locked.status as LeadStatus,
      optionsCount,
      lead
    )
    await tx.lead.update({ where: { id: leadId }, data: { updatedAt: new Date() } })
    // Событие option_added: пометка предварительного + перечень
    // переопределений; себестоимость и строки расчёта в ленту не идут
    // (RULES 2.15).
    await emitEvent(tx, {
      target: { leadId },
      actor,
      type: 'option_added',
      description:
        `Добавлен вариант расчёта: ${data.description} — ${formatMoneyWithVat(data.price, data.currency, data.vatMode as VatModeCode)}, ${data.etaDays} дн.` +
        (isPreliminary ? ' — предварительный расчёт' : '') +
        (applied.editedFields.length > 0 ? ` — изменено полей: ${applied.editedFields.length}` : '') +
        (statusChange
          ? ` — статус: ${LEAD_STATUS_LABELS[statusChange.from]} → ${LEAD_STATUS_LABELS[statusChange.to]}`
          : ''),
    })
    const calcRows = await tx.quoteOptionCalcLine.findMany({
      where: { optionId: created.id },
      orderBy: { sortOrder: 'asc' },
    })
    return {
      ok: true as const,
      option: { ...created, calcLines: calcRows },
      calcTotals: calcRows.length > 0 ? sumOptionCalc(calcRows, data.currency) : null,
      statusChange,
      isPreliminary,
      missing: eff.missing,
    }
  })
  return txResult
}

export type FillFromLeadResult =
  | { ok: false; status: number; error: string }
  | { ok: true; option: Record<string, unknown> }

// «Заполнить из запроса» для легаси-варианта (план §4.5): снимки
// постфактум, sourceFields заполняются, ревизия filled_from_lead.
export async function fillFromLead(
  optionId: string,
  employee: CurrentEmployee
): Promise<FillFromLeadResult> {
  const actor = employeeActorOf(employee)
  return db.$transaction(async (tx) => {
    const existing = await tx.quoteOption.findUnique({
      where: { id: optionId },
      select: { id: true, leadId: true, routeSnapshot: true },
    })
    if (!existing) return { ok: false as const, status: 404, error: 'Вариант расчёта не найден' }
    if (existing.routeSnapshot !== null) {
      return { ok: false as const, status: 409, error: 'Снимки уже заполнены — правьте вариант или создайте «Заполнить из запроса» заново нельзя' }
    }
    const lead = await loadLeadBlank(tx, existing.leadId)
    if (!lead) return { ok: false as const, status: 404, error: 'Запрос не найден' }
    const base = buildOptionSnapshots(lead)
    const updated = await tx.quoteOption.update({
      where: { id: optionId },
      data: {
        routeSnapshot: base.routeSnapshot as unknown as Prisma.InputJsonObject,
        cargoSnapshot: base.cargoSnapshot as unknown as Prisma.InputJsonObject,
        sourceFields: base.sourceFields as unknown as Prisma.InputJsonArray,
        editedFields: [] as unknown as Prisma.InputJsonArray,
        updatedById: employee.id,
        updatedByName: employee.name,
      },
    })
    await recordOptionRevision(tx, {
      optionId,
      kind: 'filled_from_lead',
      actor: { type: actor.type, id: actor.id, name: actor.name },
      changedFields: {
        routeSnapshot: { from: null, to: 'снимки заполнены из запроса' },
        cargoSnapshot: { from: null, to: 'снимки заполнены из запроса' },
      },
    })
    // Автомат статуса (§6.4/D75): заполнение снимков может открыть полноту
    const statusChange = await applyAutoLeadStatus(
      tx,
      existing.leadId,
      lead.status as LeadStatus,
      await tx.quoteOption.count({ where: { leadId: existing.leadId } }),
      lead
    )
    await tx.lead.update({ where: { id: existing.leadId }, data: { updatedAt: new Date() } })
    await emitEvent(tx, {
      target: { leadId: existing.leadId },
      actor,
      type: 'option_updated',
      description:
        `Вариант расчёта заполнен из запроса: ${updated.description}` +
        (statusChange
          ? ` — статус: ${LEAD_STATUS_LABELS[statusChange.from]} → ${LEAD_STATUS_LABELS[statusChange.to]}`
          : ''),
    })
    return { ok: true as const, option: { ...updated, calcLines: [], revisions: [] } }
  })
}
