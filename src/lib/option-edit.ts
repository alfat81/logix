import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import type { CurrentEmployee } from '@/lib/auth'
import { emitEvent } from '@/lib/events'
import type {
  OptionCalcLineInput,
  UpdateQuoteOptionInput,
} from '@/lib/leads'
import {
  buildOptionSnapshots,
  applyOverrides,
  completeness,
} from '@/lib/option-snapshots'
import {
  sumOptionCalc,
  calcMismatch,
  type OptionCalcTotals,
} from '@/lib/option-calc'
import {
  recordOptionRevision,
  buildChangedFields,
  changedFieldsSummary,
} from '@/lib/option-revisions'
import { employeeActorOf, loadLeadBlank, prepareCalcLines } from '@/lib/option-write'

// ─── DF-27 волна 1: правка варианта (план v1.2 §4.3, §9) ────────────
// Снимки и строки расчёта правятся свободно; изменённые ключи
// дописываются в editedFields; в той же транзакции — ревизия updated
// с диффом {ключ: {from, to}}. Правка варианта не меняет запрос и
// другие варианты — по построению (снимки копируются значениями).
// priceReviewRequired сбрасывается правкой/пересохранением (ревизия
// price_review_reset); ручная установка true запрещена (сервер ставит
// его только при ценозначимой правке запроса).

export type UpdateOptionResult =
  | { ok: false; status: number; error: string; missing?: string[] }
  | {
      ok: true
      option: Record<string, unknown>
      calcTotals: OptionCalcTotals | null
      calcMismatchAmount: number | null
      priceReviewReset: boolean
    }

export async function updateOption(
  optionId: string,
  data: UpdateQuoteOptionInput,
  employee: CurrentEmployee
): Promise<UpdateOptionResult> {
  const actor = employeeActorOf(employee)
  const txResult = await db.$transaction(async (tx) => {
    const existing = await tx.quoteOption.findUnique({
      where: { id: optionId },
      include: {
        calcLines: { orderBy: { sortOrder: 'asc' } },
        lead: { select: { id: true, status: true } },
      },
    })
    if (!existing) return { ok: false as const, status: 404, error: 'Вариант расчёта не найден' }
    const lead = await loadLeadBlank(tx, existing.leadId)
    if (!lead) return { ok: false as const, status: 404, error: 'Запрос не найден' }

    // Ручная установка priceReviewRequired=true запрещена (сервер ставит
    // флаг только сам — ценозначимая правка запроса, §6.5)
    if (data.priceReviewRequired === true) {
      return {
        ok: false as const,
        status: 400,
        error: 'Флаг «требует пересмотра цены» выставляется сервером при изменении данных запроса',
      }
    }

    const offerCurrency = data.currency ?? existing.currency
    const lines = await prepareCalcLines(tx, data.calcLines, offerCurrency)
    if (!lines.ok) return { ok: false as const, status: 400, error: lines.error }

    // ── Снимки: base = существующие, для легаси — из запроса ──
    const existingSnapshots =
      existing.routeSnapshot !== null && existing.cargoSnapshot !== null
        ? {
            routeSnapshot: existing.routeSnapshot as Record<string, unknown>,
            cargoSnapshot: existing.cargoSnapshot as Record<string, unknown>,
            sourceFields: Array.isArray(existing.sourceFields) ? (existing.sourceFields as string[]) : [],
          }
        : buildOptionSnapshots(lead)
    const hasOverrides =
      data.route !== undefined ||
      data.cargo !== undefined ||
      data.wishes !== undefined ||
      data.routeStops !== undefined
    const applied = hasOverrides
      ? applyOverrides(
          {
            routeSnapshot: existingSnapshots.routeSnapshot as never,
            cargoSnapshot: existingSnapshots.cargoSnapshot as never,
            sourceFields: existingSnapshots.sourceFields,
          },
          {
            route: data.route as Record<string, unknown> | undefined,
            cargo: data.cargo,
            routeStops: data.routeStops as unknown[] | null | undefined,
            wishes: data.wishes,
          }
        )
      : null

    // ── Полнота при снятии пометки «предварительный» (план §9) ──
    if (data.isPreliminary === false) {
      const eff = completeness(lead, {
        routeSnapshot: (applied?.routeSnapshot ?? existingSnapshots.routeSnapshot) as Record<string, unknown>,
        cargoSnapshot: (applied?.cargoSnapshot ?? existingSnapshots.cargoSnapshot) as Record<string, unknown>,
      })
      if (eff.missing.length > 0) {
        return {
          ok: false as const,
          status: 422,
          error: 'Снимите пометку после заполнения недостающих данных',
          missing: eff.missing,
        }
      }
    }

    // ── Дифф «до» (по верхнеуровневым ключам, план §3 QuoteOptionRevision)
    const beforeLines = existing.calcLines
    const before: Record<string, unknown> = {
      description: existing.description,
      transportModes: existing.transportModes ?? null,
      price: existing.price.toString(),
      currency: existing.currency,
      vatMode: existing.vatMode,
      costEstimate: existing.costEstimate?.toString() ?? null,
      costCurrency: existing.costCurrency,
      etaDays: existing.etaDays,
      priorityFit: existing.priorityFit,
      isSelected: existing.isSelected,
      routeSnapshot: existing.routeSnapshot ?? null,
      cargoSnapshot: existing.cargoSnapshot ?? null,
      routeStops: existing.routeStops ?? null,
      isPreliminary: existing.isPreliminary,
      calcLines: { count: beforeLines.length, total: sumOptionCalc(beforeLines, existing.currency).total },
    }

    // ── Снятие флага пересмотра цены: осознанное false ИЛИ любая
    // правка состава (правка/пересохранение — §6.5) ──
    const substantive =
      data.description !== undefined ||
      data.transportModes !== undefined ||
      data.price !== undefined ||
      data.currency !== undefined ||
      data.vatMode !== undefined ||
      data.costEstimate !== undefined ||
      data.costCurrency !== undefined ||
      data.etaDays !== undefined ||
      data.priorityFit !== undefined ||
      data.isSelected !== undefined ||
      hasOverrides ||
      data.calcLines !== undefined ||
      data.isPreliminary !== undefined
    const priceReviewReset = (data.priceReviewRequired === false || substantive) && existing.priceReviewRequired

    if (data.isSelected) {
      await tx.quoteOption.updateMany({
        where: { leadId: existing.leadId, isSelected: true, id: { not: optionId } },
        data: { isSelected: false },
      })
    }
    const updated = await tx.quoteOption.update({
      where: { id: optionId },
      data: {
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.transportModes !== undefined
          ? { transportModes: data.transportModes as unknown as Prisma.InputJsonArray }
          : {}),
        ...(data.price !== undefined ? { price: data.price } : {}),
        ...(data.currency !== undefined ? { currency: data.currency } : {}),
        ...(data.vatMode !== undefined ? { vatMode: data.vatMode } : {}),
        ...(data.costEstimate !== undefined ? { costEstimate: data.costEstimate } : {}),
        ...(data.costCurrency !== undefined ? { costCurrency: data.costCurrency } : {}),
        ...(data.etaDays !== undefined ? { etaDays: data.etaDays } : {}),
        ...(data.priorityFit !== undefined ? { priorityFit: data.priorityFit } : {}),
        ...(data.isSelected !== undefined ? { isSelected: data.isSelected } : {}),
        ...(data.isPreliminary !== undefined ? { isPreliminary: data.isPreliminary } : {}),
        ...(applied
          ? {
              routeSnapshot: applied.routeSnapshot as unknown as Prisma.InputJsonObject,
              cargoSnapshot: applied.cargoSnapshot as unknown as Prisma.InputJsonObject,
              routeStops:
                applied.routeStops !== null
                  ? (applied.routeStops as unknown as Prisma.InputJsonArray)
                  : Prisma.DbNull,
              sourceFields: applied.sourceFields as unknown as Prisma.InputJsonArray,
              editedFields: applied.editedFields as unknown as Prisma.InputJsonArray,
            }
          : {}),
        // Правка/пересохранение снимает флаг (ревизия price_review_reset)
        ...(priceReviewReset ? { priceReviewRequired: false } : {}),
        updatedById: employee.id,
        updatedByName: employee.name,
      },
    })

    // ── Строки расчёта — полная замена (idempotent-семантика PATCH) ──
    if (data.calcLines !== undefined) {
      await tx.quoteOptionCalcLine.deleteMany({ where: { optionId } })
      if (lines.rows.length > 0) {
        await tx.quoteOptionCalcLine.createMany({
          data: lines.rows.map((r) => ({ ...r, optionId })),
        })
      }
    }
    const newLines = await tx.quoteOptionCalcLine.findMany({
      where: { optionId },
      orderBy: { sortOrder: 'asc' },
    })
    const after: Record<string, unknown> = {
      description: updated.description,
      transportModes: updated.transportModes ?? null,
      price: updated.price.toString(),
      currency: updated.currency,
      vatMode: updated.vatMode,
      costEstimate: updated.costEstimate?.toString() ?? null,
      costCurrency: updated.costCurrency,
      etaDays: updated.etaDays,
      priorityFit: updated.priorityFit,
      isSelected: updated.isSelected,
      routeSnapshot: updated.routeSnapshot ?? null,
      cargoSnapshot: updated.cargoSnapshot ?? null,
      routeStops: updated.routeStops ?? null,
      isPreliminary: updated.isPreliminary,
      calcLines: { count: newLines.length, total: sumOptionCalc(newLines, updated.currency).total },
    }
    const changed = buildChangedFields(before, after)

    // ── Ревизии: price_review_reset + updated с диффом ──
    if (priceReviewReset) {
      await recordOptionRevision(tx, {
        optionId,
        kind: 'price_review_reset',
        actor: { type: actor.type, id: actor.id, name: actor.name },
        changedFields: { priceReviewRequired: { from: true, to: false } },
      })
    }
    if (Object.keys(changed).length > 0) {
      await recordOptionRevision(tx, {
        optionId,
        kind: 'updated',
        actor: { type: actor.type, id: actor.id, name: actor.name },
        changedFields: changed,
      })
    }

    // Ж5: правка варианта — движение по лиду
    await tx.lead.update({ where: { id: existing.leadId }, data: { updatedAt: new Date() } })

    // Ж2: журнал — выбор и правка отдельными записями, в той же
    // транзакции (прецедент В3)
    if (data.isSelected === true) {
      await emitEvent(tx, {
        target: { leadId: existing.leadId },
        actor,
        type: 'option_selected',
        description: `Выбран вариант расчёта: ${updated.description}`,
      })
    }
    if (substantive) {
      const summary = changedFieldsSummary(changed)
      await emitEvent(tx, {
        target: { leadId: existing.leadId },
        actor,
        type: 'option_updated',
        description:
          `Обновлён вариант расчёта: ${updated.description}` +
          (summary ? ` — ${summary.slice(0, 300)}` : ''),
      })
    }

    const totals = newLines.length > 0 ? sumOptionCalc(newLines, updated.currency) : null
    return {
      ok: true as const,
      option: { ...updated, calcLines: newLines },
      calcTotals: totals,
      calcMismatchAmount: calcMismatch(totals, updated.costEstimate),
      priceReviewReset,
    }
  })
  return txResult
}

