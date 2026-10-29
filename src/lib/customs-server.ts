import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import {
  computeCustomsCalculation,
  CustomsInputError,
  CUSTOMS_RULES_VERSION,
  type ComputeCustomsInput,
  type CustomsCalcInput,
  type CustomsFeeRow,
  type CustomsFxSnapshot,
  type CustomsTotals,
} from '@/lib/customs'
import { incotermMetaOf } from '@/lib/ref'
import { resolveActiveCurrencies, resolveActiveRefs } from '@/lib/ref-db'
import { getSetting } from '@/lib/settings'
import { mskToday } from '@/lib/cbr'
import { formatMoney } from '@/lib/money'
import { employeeActor } from '@/lib/activity'
import { emitEvent } from '@/lib/events'

// ─── DF-19: серверный конвейер расчёта таможенных платежей ────────────
// Вся денежная арифметика — в чистых функциях lib/customs.ts (RULES
// 2.15); здесь только доступ к данным: снимок курсов (CurrencyRate +
// ручные значения), действующая редакция шкалы сборов, валидация
// справочниками и сохранение версии В ТРАНЗАКЦИИ с событием (инвариант
// «событие в той же транзакции», DoD 9).
//
// Воспроизводимость (D38, инвариант 11): в расчёте остаётся СНИМОК
// входных данных, курсов (за единицу, источник cbr/manual), запаса и
// версии правил — последующая смена курса в справочнике сохранённые
// числа не меняет (e2e DF-19).

// Правила условия поставки — черновик (meta.draft): расчёт не
// применяется до сида/утверждения (O-12). Отдельный класс — роут
// отвечает 409, а не 400 (ошибка состояния, не формы).
export class CustomsRulesDraftError extends Error {}

const TX_OPTS = { timeout: 60_000, maxWait: 10_000 } // урок v0.6.8 (P2028)

export type CustomsCalculationRow = Prisma.CustomsCalculationGetPayload<{
  include: { items: { orderBy: { sortOrder: 'asc' } } }
}>

// ─── Чтение: история расчётов сделки (новые сверху) ──────────────────
export async function listCalculations(where: { leadId?: string; orderId?: string }): Promise<CustomsCalculationRow[]> {
  return db.customsCalculation.findMany({
    where,
    orderBy: [{ isCurrent: 'desc' }, { createdAt: 'desc' }],
    include: { items: { orderBy: { sortOrder: 'asc' } } },
  })
}

// ─── Снимок курсов: за ОДНУ единицу, источник cbr | manual ───────────
// Приоритет: ручное значение (курс известен менеджеру из ДТ — импорт
// мог не приехать или нужна дата регистрации) → последний курс ЦБ
// ≤ fxDate → missing (роут предложит ввести вручную). RUB всегда 1:1.
export async function buildFxSnapshot(
  codes: string[],
  fxDateIso: string,
  manual: Record<string, string> | undefined
): Promise<{ snapshot: CustomsFxSnapshot; missing: string[] }> {
  const snapshot: CustomsFxSnapshot = {}
  const missing: string[] = []
  const day = new Date(`${fxDateIso}T00:00:00.000Z`)
  for (const code of [...new Set(codes.map((c) => c.trim().toUpperCase()))]) {
    if (code === 'RUB') {
      snapshot.RUB = { rate: '1', date: fxDateIso, source: 'cbr' }
      continue
    }
    const m = manual?.[code]
    if (typeof m === 'string' && m.trim() !== '') {
      snapshot[code] = { rate: m.trim(), date: fxDateIso, source: 'manual' }
      continue
    }
    const row = await db.currencyRate.findFirst({
      where: { code, date: { lte: day } },
      orderBy: [{ date: 'desc' }],
      select: { date: true, value: true },
    })
    if (row) {
      snapshot[code] = {
        rate: String(row.value),
        date: row.date.toISOString().slice(0, 10),
        source: 'cbr',
      }
    } else {
      missing.push(code)
    }
  }
  return { snapshot, missing }
}

// ─── Действующая редакция шкалы сборов (validFrom ≤ даты расчёта) ────
export async function loadFeeRows(calcDate: Date): Promise<CustomsFeeRow[]> {
  const latest = await db.customsFeeScale.findFirst({
    where: { validFrom: { lte: calcDate } },
    orderBy: [{ validFrom: 'desc' }],
    select: { validFrom: true },
  })
  if (!latest) return [] // шкалы нет — ручной ввод (карточка DF-19)
  const rows = await db.customsFeeScale.findMany({
    where: { validFrom: latest.validFrom },
    orderBy: [{ sortOrder: 'asc' }],
    select: { upperBound: true, feeRub: true },
  })
  return rows.map((r) => ({
    upperBound: r.upperBound === null ? null : r.upperBound.toString(),
    feeRub: r.feeRub.toString(),
  }))
}

// ── Валидация правил и валют справочниками (O-12/IC-16) ──────────────
async function resolveFlags(incoterm: string): Promise<{
  addFreightToArrival: boolean
  addInsurance: boolean
  deductPostArrival: boolean
}> {
  const resolved = await resolveActiveRefs('incoterm', [incoterm])
  if (resolved.invalid.length > 0) {
    throw new CustomsInputError(`Условие поставки не найдено в справочнике: ${resolved.invalid.join(', ')}`)
  }
  const meta = incotermMetaOf(resolved.meta.get(incoterm))
  if (!meta) {
    throw new CustomsRulesDraftError(
      `Правила для ${incoterm} отсутствуют в справочнике — выполните сид справочников (scripts/seed.ts)`
    )
  }
  if (meta.draft) {
    throw new CustomsRulesDraftError(
      `Правила для ${incoterm} — черновик и не утверждены брокером: расчёт не выполняется`
    )
  }
  return {
    addFreightToArrival: meta.addFreightToArrival === true,
    addInsurance: meta.addInsurance === true,
    deductPostArrival: meta.deductPostArrival === true,
  }
}

async function assertCurrencies(input: CustomsCalcInput): Promise<void> {
  const codes = [input.freightCurrency, ...input.items.map((it) => it.goodsCurrency)]
  const { invalid } = await resolveActiveCurrencies(codes)
  if (invalid.length > 0) {
    throw new CustomsInputError(`Валюта не найдена в справочнике или отключена: ${invalid.join(', ')}`)
  }
}

function engineInput(
  input: CustomsCalcInput,
  flags: { addFreightToArrival: boolean; addInsurance: boolean; deductPostArrival: boolean },
  feeRows: CustomsFeeRow[],
  fx: CustomsFxSnapshot,
  reservePercent: number
): ComputeCustomsInput {
  return {
    flags,
    freightTotal: input.freightTotal,
    freightCurrency: input.freightCurrency,
    freightToArrival: input.freightToArrival ?? null,
    insurance: input.insurance,
    otherCosts: input.otherCosts,
    items: input.items.map((it) => ({
      brokerItemId: it.brokerItemId ?? null,
      hsCode: it.hsCode,
      goodsValue: it.goodsValue,
      goodsCurrency: it.goodsCurrency,
      netWeightKg: it.netWeightKg,
      dutyPercent: it.dutyPercent ?? null,
      addDutyPercent: it.addDutyPercent ?? null,
      vatPercent: it.vatPercent ?? null,
    })),
    fx,
    reservePercent,
    allocationOverride: input.allocationOverride ?? null,
    feeRows,
    feeRubManual: input.feeRubManual ?? null,
    brokerFeeRub: input.brokerFeeRub ?? null,
  }
}

function placeOf(input: CustomsCalcInput): string {
  return [input.incoterm, input.incotermPlace?.trim()].filter(Boolean).join(', ')
}

function calcDescription(totals: CustomsTotals, input: CustomsCalcInput, action: 'saved' | 'updated'): string {
  const tail = action === 'updated' ? ' (правка черновика)' : ''
  const fee = totals.brokerFeeRub ? `, вознаграждение брокера ${formatMoney(totals.brokerFeeRub)}` : ''
  return `Расчёт таможенных платежей (${placeOf(input)})${tail}: платежи ${formatMoney(totals.paymentsTotal)}${fee}`
}

// ─── POST: новый расчёт (версия) ─────────────────────────────────────
// Прежняя актуальная версия становится isCurrent=false, история
// хранится (карточка DF-19). Событие — в той же транзакции.
export async function createCalculation(opts: {
  leadId?: string
  orderId?: string
  input: CustomsCalcInput
  employee: { id: string; name: string }
}): Promise<CustomsCalculationRow> {
  const { leadId, orderId, input, employee } = opts
  const flags = await resolveFlags(input.incoterm)
  await assertCurrencies(input)

  const calcDateIso = input.calcDate ?? mskToday()
  const fxDateIso = input.fxDate ?? calcDateIso
  const calcDate = new Date(`${calcDateIso}T00:00:00.000Z`)
  const feeRows = await loadFeeRows(calcDate)
  const reservePercent = await getSetting('customs.fx_reserve_percent')

  const { snapshot, missing } = await buildFxSnapshot(
    [input.freightCurrency, ...input.items.map((it) => it.goodsCurrency)],
    fxDateIso,
    input.fxRatesManual
  )
  if (missing.length > 0) {
    throw new CustomsInputError(
      `Курс на ${fxDateIso} недоступен для: ${missing.join(', ')} — введите курс вручную (графа «Курсы вручную»)`
    )
  }

  const { items, totals } = computeCustomsCalculation(
    engineInput(input, flags, feeRows, snapshot, reservePercent)
  )

  return db.$transaction(
    async (tx) => {
      await tx.customsCalculation.updateMany({
        where: leadId ? { leadId, isCurrent: true } : { orderId: orderId!, isCurrent: true },
        data: { isCurrent: false },
      })
      const created = await tx.customsCalculation.create({
        data: {
          leadId: leadId ?? null,
          orderId: orderId ?? null,
          incoterm: input.incoterm,
          incotermPlace: input.incotermPlace?.trim() || null,
          calcDate,
          fxDate: new Date(`${fxDateIso}T00:00:00.000Z`),
          fxRates: snapshot,
          fxReservePercent: reservePercent,
          freightTotal: input.freightTotal,
          freightCurrency: input.freightCurrency,
          freightToArrival: input.freightToArrival ?? null,
          insurance: input.insurance,
          otherCosts: input.otherCosts,
          brokerFeeRub: input.brokerFeeRub ?? null,
          allocationOverride: (input.allocationOverride ?? Prisma.JsonNull) as Prisma.InputJsonValue,
          rulesVersion: CUSTOMS_RULES_VERSION,
          feeRub: totals.feeRub,
          feeManual: input.feeRubManual != null,
          totals: totals as unknown as Prisma.InputJsonValue,
          isCurrent: true,
          createdById: employee.id,
          createdByName: employee.name,
          items: {
            create: items.map((it, i) => ({
              sortOrder: i,
              brokerItemId: input.items[i].brokerItemId ?? null,
              hsCode: it.hsCode,
              goodsValue: input.items[i].goodsValue,
              goodsCurrency: input.items[i].goodsCurrency,
              netWeightKg: input.items[i].netWeightKg,
              dutyPercent: input.items[i].dutyPercent ?? null,
              addDutyPercent: input.items[i].addDutyPercent ?? null,
              vatPercent: input.items[i].vatPercent ?? null,
              customsValue: it.customsValue,
              duty: it.duty,
              addDuty: it.addDuty,
              vat: it.vat,
              allocatedCosts: it.allocatedCosts,
            })),
          },
        },
        include: { items: { orderBy: { sortOrder: 'asc' } } },
      })
      await emitEvent(tx, {
        target: leadId ? { leadId } : { orderId: orderId! },
        actor: employeeActor(employee),
        type: 'customs_calc_saved',
        description: calcDescription(totals, input, 'saved'),
      })
      return created
    },
    TX_OPTS
  )
}

// ─── PUT: правка черновика (только актуальной версии) ────────────────
// Пересчёт по отредактированным входным данным; история версий не
// плодится правками одного и того же расчёта (новая версия — POST).
export async function updateCalculation(opts: {
  id: string
  input: CustomsCalcInput
  employee: { id: string; name: string }
}): Promise<CustomsCalculationRow> {
  const { id, input, employee } = opts
  const existing = await db.customsCalculation.findUnique({ where: { id } })
  if (!existing) throw new CustomsNotFoundError()
  if (!existing.isCurrent) {
    throw new CustomsInputError('Править можно только актуальную версию — сделайте пересчёт (создаст новую)')
  }
  const leadId = existing.leadId ?? undefined
  const orderId = existing.orderId ?? undefined

  const flags = await resolveFlags(input.incoterm)
  await assertCurrencies(input)

  const calcDateIso = input.calcDate ?? mskToday()
  const fxDateIso = input.fxDate ?? calcDateIso
  const calcDate = new Date(`${calcDateIso}T00:00:00.000Z`)
  const feeRows = await loadFeeRows(calcDate)
  const reservePercent = await getSetting('customs.fx_reserve_percent')

  const { snapshot, missing } = await buildFxSnapshot(
    [input.freightCurrency, ...input.items.map((it) => it.goodsCurrency)],
    fxDateIso,
    input.fxRatesManual
  )
  if (missing.length > 0) {
    throw new CustomsInputError(
      `Курс на ${fxDateIso} недоступен для: ${missing.join(', ')} — введите курс вручную (графа «Курсы вручную»)`
    )
  }

  const { items, totals } = computeCustomsCalculation(
    engineInput(input, flags, feeRows, snapshot, reservePercent)
  )

  return db.$transaction(
    async (tx) => {
      const updated = await tx.customsCalculation.update({
        where: { id },
        data: {
          incoterm: input.incoterm,
          incotermPlace: input.incotermPlace?.trim() || null,
          calcDate,
          fxDate: new Date(`${fxDateIso}T00:00:00.000Z`),
          fxRates: snapshot,
          fxReservePercent: reservePercent,
          freightTotal: input.freightTotal,
          freightCurrency: input.freightCurrency,
          freightToArrival: input.freightToArrival ?? null,
          insurance: input.insurance,
          otherCosts: input.otherCosts,
          brokerFeeRub: input.brokerFeeRub ?? null,
          allocationOverride: (input.allocationOverride ?? Prisma.JsonNull) as Prisma.InputJsonValue,
          rulesVersion: CUSTOMS_RULES_VERSION,
          feeRub: totals.feeRub,
          feeManual: input.feeRubManual != null,
          totals: totals as unknown as Prisma.InputJsonValue,
          items: {
            deleteMany: {},
            create: items.map((it, i) => ({
              sortOrder: i,
              brokerItemId: input.items[i].brokerItemId ?? null,
              hsCode: it.hsCode,
              goodsValue: input.items[i].goodsValue,
              goodsCurrency: input.items[i].goodsCurrency,
              netWeightKg: input.items[i].netWeightKg,
              dutyPercent: input.items[i].dutyPercent ?? null,
              addDutyPercent: input.items[i].addDutyPercent ?? null,
              vatPercent: input.items[i].vatPercent ?? null,
              customsValue: it.customsValue,
              duty: it.duty,
              addDuty: it.addDuty,
              vat: it.vat,
              allocatedCosts: it.allocatedCosts,
            })),
          },
        },
        include: { items: { orderBy: { sortOrder: 'asc' } } },
      })
      await emitEvent(tx, {
        target: leadId ? { leadId } : { orderId: orderId! },
        actor: employeeActor(employee),
        type: 'customs_calc_saved',
        description: calcDescription(totals, input, 'updated'),
      })
      return updated
    },
    TX_OPTS
  )
}

// Расчёт не найден (роут отдаёт 404)
export class CustomsNotFoundError extends Error {
  constructor() {
    super('Расчёт не найден')
  }
}

