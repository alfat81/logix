// Типы экрана расчёта таможенных платежей (DF-19, P1-19-паттерн:
// чистые типы без серверных зависимостей). Decimal из API приходит
// строкой — числа читаются через Number на рендере.

// Итоги расчёта — ТИП из lib/customs.ts (единственная точка структуры,
// IC-14: дубликата формы нет); имя оставлено для читаемости UI.
import type { CustomsTotals } from '@/lib/customs'
export type CustomsTotalsView = CustomsTotals

export type CustomsFxEntryView = { rate: string; date: string; source: string }

export type CustomsCalcItemRow = {
  id: string
  sortOrder: number
  brokerItemId: string | null
  hsCode: string
  goodsValue: string
  goodsCurrency: string
  netWeightKg: string
  dutyPercent: string | null
  addDutyPercent: string | null
  vatPercent: string | null
  customsValue: string
  duty: string
  addDuty: string
  vat: string
  allocatedCosts: string
}

export type CustomsCalcRow = {
  id: string
  leadId: string | null
  orderId: string | null
  incoterm: string
  incotermPlace: string | null
  calcDate: string
  fxDate: string
  fxRates: Record<string, CustomsFxEntryView> | null
  fxReservePercent: string
  freightTotal: string
  freightCurrency: string
  freightToArrival: string | null
  insurance: string
  otherCosts: string
  brokerFeeRub: string | null
  allocationOverride: { freight?: 'weight' | 'value'; other?: 'weight' | 'value' } | null
  rulesVersion: string
  feeRub: string | null
  feeManual: boolean
  totals: CustomsTotalsView
  isCurrent: boolean
  createdByName: string
  createdAt: string
  updatedAt: string
  items: CustomsCalcItemRow[]
}

// Источник предзаполнения строк — ответ брокера (DF-18): последние
// отправленные проценты по кодам; менеджер дополняет стоимостью/весом.
export type EstimatePrefillItem = {
  id: string
  hsCode: string
  dutyPercent: number | string | null
  addDutyPercent: number | string | null
  vatPercent: number | string | null
  rateNote?: string | null
}

export type EstimatePrefill = {
  brokerName: string
  status: string
  sentAt: string | null
  updatedAt: string
  items: EstimatePrefillItem[]
}

// Подсказка фрахта из выбранного варианта расчёта (карточка DF-19:
// «фрахт по умолчанию из QuoteOption, правится вручную» — берём
// себестоимость, при её отсутствии цену варианта)
export type FreightSuggest = { amount: number | string; currency: string } | null

// Форма одной строки расчёта (редактируемый черновик, D40)
export type FormItem = {
  brokerItemId: string | null
  hsCode: string
  hsName?: string
  goodsValue: string
  goodsCurrency: string
  netWeightKg: string
  dutyPercent: string
  addDutyPercent: string
  vatPercent: string
}

export const fmtRu = (iso: string): string => new Date(iso).toLocaleDateString('ru-RU')

export const fmtRuDateTime = (iso: string): string =>
  new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
