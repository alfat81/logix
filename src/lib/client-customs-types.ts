// ─── DF-27 волна 2 (Р-5/D73): тип клиентской проекции таможенного расчёта
// (кабинет клиента — компонент ClientCustomsResult; белый список полей,
// без истории версий и пересчётов — Р-5)
export type ClientCustomsTotals = Record<string, string | number>

export type CustomsCalculationView = {
  incoterm: string
  incotermPlace: string | null
  calcDate: string
  fxDate: string
  totals: ClientCustomsTotals
  items: Array<{
    hsCode: string
    netWeightKg: string | number
    dutyPercent: string | number | null
    addDutyPercent: string | number | null
    vatPercent: string | number | null
    customsValue: string | number
    duty: string | number
    addDuty: string | number
    vat: string | number
  }>
}

export type FinalPaymentView = {
  dtDate: string
  lines: Array<{ kind: string; amount: string | number; currency: string }>
  note: string | null
}
