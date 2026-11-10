// Поток A волна 1 (BL): типы наружных проекций кабинета клиента
// (общие для ClientLeadCard и ClientQuoteOptions — RULES 2.14).
// Наружная проекция варианта БЕЗ себестоимости — тип просто не содержит поле.
export type ClientOptionRow = {
  id: string
  description: string
  transportModes: string[] | null
  // Decimal из API приходит строкой
  price: string
  currency: string
  vatMode: string
  etaDays: number
  priorityFit: string
  isSelected: boolean
  createdAt: string
}

// Активный снимок согласования: себестоимости в снимке нет по схеме
export type ClientApprovalSnapshot = {
  description: string
  transportModes: string[] | null
  price: string
  currency: string
  vatMode: string
  etaDays: number
  priorityFit: string
  confirmedAt: string
  confirmedVia: string
}
