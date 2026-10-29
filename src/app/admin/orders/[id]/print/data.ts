import { formatMoney, isCurrencyCode, isVatMode, VAT_MODE_LABELS } from '@/lib/money'
import { TRANSPORT_TYPE_LABELS, joinRouteText } from '@/lib/route-fields'
import { readLeadCargo } from '@/lib/leads'
import { requisitesInn } from '@/lib/requisite-fields'
import type { PrintCustoms } from './customs-data'

// v0.5.0 (P1-22): модель печатной формы заявки (Е) — выезд из
// page.tsx (резка под лимит 300, RULES 2.14). Чистые вычисления без
// JSX: вся подготовка данных бланка — здесь, разметка — в PrintTable.
// Форматирование и толерантный разбор — 1:1 с прежним кодом.

export type QuoteSnapshotData = {
  description?: string
  transportModes?: string[]
  // P1-04: цена с валютой/НДС; priceEstimate — легаси-ключ снимков
  // до миграции (рубли) — читается как RUB-фолбэк
  price?: number | string
  currency?: string
  vatMode?: string
  priceEstimate?: number
  etaDays?: number
}

export type PrintOrder = {
  number: string
  createdAt: Date
  contract: { number: number | string; signedAt: Date | null }
  legalEntity: { name: string; requisites: unknown }
  customer: { name: string; phone: string | null; email: string | null }
  lead: { rawContact: unknown } | null
  cargoInfo: unknown
  transportType: string | null
  originCountry: string | null
  originCity: string | null
  destinationCountry: string | null
  destinationCity: string | null
  readyDate: Date | string | null
  hsCode: string | null
}

export type PrintModel = {
  number: string
  createdAt: Date
  contractNumber: number | string
  contractSignedAt: Date | null
  legalEntityName: string
  inn: string
  kpp: string
  address: string
  customerName: string
  transportType: string
  route: string
  originText: string
  destinationText: string
  readyDateText: string
  cargoName: string
  hsCodeText: string
  placesCount: unknown
  weightKg: unknown
  volumeM3: unknown
  packaging: string
  cargoValue: string
  dangerous: unknown
  stackable: unknown
  tiltable: unknown
  specialRequirements: string
  shipperName: string
  shipperInn: string
  shipperAddress: string
  consigneeName: string
  consigneeInn: string
  consigneeAddress: string
  quoteDescription: string
  quoteEta: number | null
  quotePrice: number | null
  quoteCurrency: string
  quoteVat: string
  // DF-19: приложение с расчётом таможенных платежей (оценка) —
  // заполняет страница при наличии текущего расчёта заявки
  customs: PrintCustoms | null
  executorName: string
  executorPhone: string
  executorEmail: string
}

export function fmtRuDate(d: Date | null | undefined): string {
  if (!d) return ''
  const dd = String(d.getUTCDate()).padStart(2, '0')
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  return `${dd}.${mm}.${d.getUTCFullYear()}`
}

export function fmtMoney(n: number): string {
  return formatMoney(n, 'RUB')
}

export function fmtNum(v: unknown): string {
  if (typeof v !== 'number' || !Number.isFinite(v)) return ''
  // «19.5» → «19,5» — бланк оперирует запятой
  return String(v).replace('.', ',')
}

export function fmtBool(v: unknown): string {
  if (v === true) return 'Да'
  if (v === false) return 'Нет'
  return ''
}

export function buildPrintModel(order: PrintOrder): PrintModel {
  const cargo = readLeadCargo(order.cargoInfo)
  const s = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

  // Снимок условий сделки (Ж1): толерантный разбор — поля опциональны
  const q = (order as { quoteSnapshot?: unknown }).quoteSnapshot ?? {}
  const snap = q as QuoteSnapshotData
  const quoteDescription = typeof snap.description === 'string' ? snap.description : ''
  // P1-04: цена — новый ключ price (число/строка Decimal) либо легаси
  // priceEstimate (рубли до миграции); валюта/НДС — с дефолтами
  const rawPrice = snap.price ?? snap.priceEstimate
  const quotePrice =
    typeof rawPrice === 'string'
      ? Number.isFinite(Number(rawPrice))
        ? Number(rawPrice)
        : null
      : typeof rawPrice === 'number'
        ? rawPrice
        : null
  const quoteCurrency = isCurrencyCode(snap.currency) ? snap.currency : 'RUB'
  const quoteVat = isVatMode(snap.vatMode) ? VAT_MODE_LABELS[snap.vatMode] : ''
  const quoteEta = typeof snap.etaDays === 'number' ? snap.etaDays : null
  const quoteModes = Array.isArray(snap.transportModes)
    ? snap.transportModes.filter((m): m is string => typeof m === 'string')
    : []

  // P1-03: тип/маршрут — из колонок заявки; легаси-ключи Json — fallback
  // (данные до миграции), последний fallback — виды транспорта варианта
  const transportLabel =
    typeof order.transportType === 'string' &&
    order.transportType in TRANSPORT_TYPE_LABELS
      ? TRANSPORT_TYPE_LABELS[order.transportType as keyof typeof TRANSPORT_TYPE_LABELS]
      : ''
  const originText = joinRouteText(order.originCountry, order.originCity) || s(cargo.from)
  const destinationText =
    joinRouteText(order.destinationCountry, order.destinationCity) || s(cargo.to)

  // Тип перевозки: из колонок (бланк п.3) либо из видов транспорта варианта
  const transportType =
    transportLabel || s(cargo.transportType) || (quoteModes.length > 0 ? quoteModes.join(', ') : '')

  // Маршрут: подробная строка бланка либо «откуда — куда» из колонок
  const route =
    s(cargo.routeNote) || [originText, destinationText].filter(Boolean).join(' — ')

  // Готовность к отгрузке (п.18): колонка readyDate → дд.мм.гггг
  const readyDateText = order.readyDate
    ? (order.readyDate instanceof Date
        ? order.readyDate.toLocaleDateString('ru-RU')
        : String(order.readyDate).slice(0, 10))
    : s(cargo.shipDate)

  // Исполнитель заявки от клиента (п.27): контакт из анкеты лида,
  // fallback — контакты клиента из справочника
  const raw = (order.lead?.rawContact ?? null) as Record<string, unknown> | null
  const executorName = raw && typeof raw.name === 'string' ? raw.name : ''
  const executorPhone =
    raw && typeof raw.phone === 'string' ? raw.phone : (order.customer.phone ?? '')
  const executorEmail =
    raw && typeof raw.email === 'string' ? raw.email : (order.customer.email ?? '')

  // Реквизиты экспедитора: известные ключи по меткам формы Ж6б
  const req = (order.legalEntity.requisites ?? {}) as Record<string, unknown>
  const reqLine = (key: string): string => {
    const v = req[key]
    return typeof v === 'string' && v.trim() ? v.trim() : ''
  }

  return {
    number: order.number,
    createdAt: order.createdAt,
    contractNumber: order.contract.number,
    contractSignedAt: order.contract.signedAt,
    legalEntityName: order.legalEntity.name,
    inn: requisitesInn(order.legalEntity.requisites) ?? '',
    kpp: reqLine('kpp'),
    address: reqLine('address'),
    customerName: order.customer.name,
    transportType,
    route,
    originText,
    destinationText,
    readyDateText,
    cargoName: s(cargo.cargoName),
    hsCodeText: s(cargo.hsCode) || s(order.hsCode),
    placesCount: cargo.placesCount,
    weightKg: cargo.weightKg,
    volumeM3: cargo.volumeM3,
    packaging: s(cargo.packaging),
    cargoValue: s(cargo.cargoValue),
    dangerous: cargo.dangerous,
    stackable: cargo.stackable,
    tiltable: cargo.tiltable,
    specialRequirements: s(cargo.specialRequirements),
    shipperName: s(cargo.shipperName),
    shipperInn: s(cargo.shipperInn),
    shipperAddress: s(cargo.shipperAddress),
    consigneeName: s(cargo.consigneeName),
    consigneeInn: s(cargo.consigneeInn),
    consigneeAddress: s(cargo.consigneeAddress),
    quoteDescription,
    quoteEta,
    quotePrice,
    quoteCurrency,
    quoteVat,
    customs: null,
    executorName,
    executorPhone,
    executorEmail,
  }
}

// Тексты пунктов 25–26 бланка (S13) — фиксированные юридические
// формулировки; вынесены из разметки (P1-22, резка под лимит 300).
export const CARGO_CONFIRMATION_TEXT =
  'Заказчик подтверждает, что груз не содержит веществ и предметов, запрещенных к перевозке авиационным, автомобильным, железнодорожным и морским транспортом. Об ответственности за неточные и неполные сведения о грузе предупреждены.'

export const CLIENT_GUARANTEES_TEXT =
  'Клиент гарантирует и подтверждает: достоверность и полноту сведений о грузе, массе, объеме, габаритах и свойствах груза, в том числе о ПВИО; груз не является товаром, в отношении которого введены запреты на импорт/экспорт в соответствии с ограничениями, установленными законодательством РФ, действующими на момент перевозки; имеет все необходимые разрешения, лицензии, сертификаты для перевозки данного груза и предоставит их Экспедитору. Направляя настоящую заявку, Клиент уведомлен об ответственности за непредоставление информации о ПВИО согласно ст. 11.14.3 КоАП РФ. При нарушении указанных гарантий Клиент несет полную ответственность, включая возмещение Экспедитору всех убытков.'
