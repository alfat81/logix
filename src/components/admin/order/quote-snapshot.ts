// Снимок условий сделки — форма и толерантное чтение (P1-19, вынесено
// из page.tsx при резке монолита). Чистый модуль без зависимостей от
// UI; структура снимка — QuoteSnapshotSchema в lib/leads.ts.
import {
  QUOTE_PRIORITY_FITS,
  type QuotePriorityFit,
} from '@/lib/leads'
import {
  isCurrencyCode,
  isVatMode,
  type CurrencyCode,
  type VatModeCode,
} from '@/lib/money'
import type { QuoteSnapshot } from './types'

// Состояние формы правки условий: всё строки (числа парсятся при
// сохранении), приоритет '' = не указан ('none' в селекте).
export type QuoteForm = {
  description: string
  price: string
  currency: string
  vatMode: string
  etaDays: string
  priorityFit: string
  modes: string[]
}

export const EMPTY_QUOTE_FORM: QuoteForm = {
  description: '',
  price: '',
  currency: 'RUB',
  vatMode: 'WITHOUT_VAT',
  etaDays: '',
  priorityFit: '',
  modes: [],
}

// Число из снимка: новый ключ price (число или строка Decimal) либо
// легаси priceEstimate (рубли)
export function snapshotPrice(snap: QuoteSnapshot): number | null {
  const raw = snap?.price ?? snap?.priceEstimate
  const n = typeof raw === 'string' ? Number(raw) : raw
  return typeof n === 'number' && Number.isFinite(n) ? n : null
}

export function snapshotCurrency(snap: QuoteSnapshot): CurrencyCode {
  return snap && isCurrencyCode(snap.currency) ? snap.currency : 'RUB'
}

export function snapshotVat(snap: QuoteSnapshot): VatModeCode | null {
  return snap && isVatMode(snap.vatMode) ? snap.vatMode : null
}

// Предзаполнение формы из снимка (замена — целиком, пустое = снято)
export function quoteFormFromSnapshot(snap: QuoteSnapshot): QuoteForm {
  const p = snapshotPrice(snap)
  return {
    description: typeof snap?.description === 'string' ? snap.description : '',
    price: p === null ? '' : String(p),
    currency: snapshotCurrency(snap),
    vatMode: snapshotVat(snap) ?? 'WITHOUT_VAT',
    etaDays:
      typeof snap?.etaDays === 'number' && Number.isFinite(snap.etaDays)
        ? String(snap.etaDays)
        : '',
    priorityFit:
      typeof snap?.priorityFit === 'string' &&
      (QUOTE_PRIORITY_FITS as readonly string[]).includes(snap.priorityFit)
        ? (snap.priorityFit as QuotePriorityFit)
        : '',
    modes: Array.isArray(snap?.transportModes)
      ? snap.transportModes.filter((m): m is string => typeof m === 'string')
      : [],
  }
}
