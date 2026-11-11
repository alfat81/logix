

import type { Prisma } from '@prisma/client'
import type {
  ClientCustomsTotals,
  CustomsCalculationView,
  FinalPaymentView,
} from '@/lib/client-customs-types'

// ─── DF-27 волна 2 (Р-5, D73/D41): клиентская проекция таможенного расчёта
// Единая точка белого списка: наружу уходят только текущая версия
// (позиции: коды/ставки/характеристики + суммы) и последняя запись
// окончательных платежей по ДТ. История версий и пересчётов клиенту
// не отдаётся (её видят менеджер и брокер).

export const CLIENT_TOTALS_FIELDS = [
  'customsValueTotal',
  'dutyTotal',
  'addDutyTotal',
  'vatTotal',
  'feeRub',
  'paymentsTotal',
  'grandTotal',
] as const

// Белый список итогов (структура totals — Json; наружу только суммы)
export function projectCustomsTotals(totals: unknown): ClientCustomsTotals {
  const raw = (totals ?? {}) as Record<string, unknown>
  const out: ClientCustomsTotals = {}
  for (const key of CLIENT_TOTALS_FIELDS) {
    if (raw[key] !== undefined) out[key] = raw[key] as string | number
  }
  return out
}

export type ClientCustomsProjection = {
  calculation: CustomsCalculationView | null
  finalPayment: FinalPaymentView | null
}

// Строка текущей версии (Prisma-тип по общему SELECT; Decimal/Json)
export type CurrentCalcRow = Prisma.CustomsCalculationGetPayload<{
  select: typeof CLIENT_CURRENT_CALC_SELECT
}>

const dec = (v: unknown): string => String(v)
const decOrNull = (v: unknown): string | null => (v === null || v === undefined ? null : String(v))

export function projectCustomsResult(
  calc: CurrentCalcRow | null,
  finalPayment: {
    dtDate: Date
    lines: unknown
    note: string | null
  } | null
): ClientCustomsProjection {
  return {
    calculation: calc
      ? {
          incoterm: calc.incoterm,
          incotermPlace: calc.incotermPlace,
          calcDate: calc.calcDate.toISOString(),
          fxDate: calc.fxDate.toISOString(),
          totals: projectCustomsTotals(calc.totals),
          // Decimal → строка (наружу JSON; формат отображения — UI)
          items: calc.items.map((it) => ({
            hsCode: it.hsCode,
            netWeightKg: dec(it.netWeightKg),
            dutyPercent: decOrNull(it.dutyPercent),
            addDutyPercent: decOrNull(it.addDutyPercent),
            vatPercent: decOrNull(it.vatPercent),
            customsValue: dec(it.customsValue),
            duty: dec(it.duty),
            addDuty: dec(it.addDuty),
            vat: dec(it.vat),
          })),
        }
      : null,
    finalPayment: finalPayment
      ? {
          dtDate: finalPayment.dtDate.toISOString(),
          lines: (Array.isArray(finalPayment.lines) ? finalPayment.lines : []) as FinalPaymentView['lines'],
          note: finalPayment.note,
        }
      : null,
  }
}

// Единый SELECT текущей версии расчёта для клиентских роутов
// (запрос/заявка): белый список полей версии + позиций (Р-5)
export const CLIENT_CURRENT_CALC_SELECT = {
  incoterm: true,
  incotermPlace: true,
  calcDate: true,
  fxDate: true,
  totals: true,
  items: {
    orderBy: { sortOrder: 'asc' as const },
    select: {
      hsCode: true,
      netWeightKg: true,
      dutyPercent: true,
      addDutyPercent: true,
      vatPercent: true,
      customsValue: true,
      duty: true,
      addDuty: true,
      vat: true,
    },
  },
} as const
