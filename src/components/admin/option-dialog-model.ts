import { parseMoneyInput } from '@/lib/money'
import type { RouteStop } from '@/lib/leads'
import type { OptionForm } from '@/components/admin/QuoteOptionFormFields'
import type { CalcLineForm } from '@/components/admin/QuoteOptionCalcLines'
import type {
  OptionRouteForm,
  OptionCargoForm,
  ProvenanceInfo,
} from '@/components/admin/QuoteOptionRouteBlocks'

// ─── DF-27 волна 1: модель диалога варианта (план §10) ──────────────
// Чистые функции без React-состояния: сборка формы из ответа
// GET /api/admin/options/[id] и сборка тела POST/PATCH из формы.
// Вынесено из QuoteOptionDialog (RULES 2.14: компонент ≤ 300 строк);
// dirty-tracking: в запрос уходят ТОЛЬКО тронутые поля — нетронутое
// поле = «как в запросе».

export type OptionDialogForm = OptionForm & {
  route: OptionRouteForm
  cargo: OptionCargoForm
  stops: RouteStop[]
  lines: CalcLineForm[]
  isPreliminary: boolean
}

export const EMPTY_ROUTE: OptionRouteForm = {
  originCity: '',
  originCountryCode: '',
  destinationCity: '',
  destinationCountryCode: '',
  transportType: '',
  readyDate: '',
  wishes: '',
}
export const EMPTY_CARGO: OptionCargoForm = {
  cargoName: '',
  hsCode: '',
  placesCount: '',
  weightKg: '',
  volumeM3: '',
  packaging: '',
  cargoValue: '',
  dangerous: '',
  specialRequirements: '',
}

// Стартовая форма создания варианта собирается в диалоге (пустая
// поверх бланка запроса; блок 1 показывает запрос рядом).

type Json = Record<string, unknown>

// Provenance из ответа GET (не зависит от базовой формы)
export function provenanceFromApi(d: unknown): ProvenanceInfo {
  const root = (d && typeof d === 'object' ? d : {}) as Json
  const o = (root.option ?? {}) as Json
  return {
    sourceFields: Array.isArray(o.sourceFields) ? (o.sourceFields as string[]) : [],
    editedFields: Array.isArray(o.editedFields) ? (o.editedFields as string[]) : [],
  }
}

// Сборка формы из ответа GET /api/admin/options/[id] (снимки, строки
// расчёта, provenance) ПОВЕРХ базовой формы (коммерческие поля base
// сохраняются — сервер их в GET-проекции варианта не возвращает).
// Толерантно к отсутствующим ключам — легаси-вариант без снимков
// даёт пустые блоки 2–3.
export function optionFormFromApi(d: unknown, base: OptionDialogForm): OptionDialogForm {
  const root = (d && typeof d === 'object' ? d : {}) as Json
  const o = (root.option ?? {}) as Json
  const route = (o.routeSnapshot ?? {}) as Json
  const snapRoot = (o.cargoSnapshot ?? {}) as Json
  const snap = (snapRoot.cargo ?? {}) as Json
  const b = (v: unknown): string => (v === true ? 'yes' : v === false ? 'no' : '')
  const s = (v: unknown): string => (typeof v === 'string' ? v : '')
  const form: OptionDialogForm = {
    ...base,
    route: {
      originCity: s(route.originCity),
      originCountryCode: s(route.originCountryCode),
      destinationCity: s(route.destinationCity),
      destinationCountryCode: s(route.destinationCountryCode),
      transportType: s(route.transportType),
      readyDate: s(route.readyDate).slice(0, 10),
      wishes: s(snapRoot.wishes),
    },
    cargo: {
      cargoName: s(snap.cargoName),
      hsCode: s(snap.hsCode),
      placesCount: s(snap.placesCount),
      weightKg: s(snap.weightKg),
      volumeM3: s(snap.volumeM3),
      packaging: s(snap.packaging),
      cargoValue: s(snap.cargoValue),
      dangerous: b(snap.dangerous),
      specialRequirements: s(snap.specialRequirements),
    },
    stops: Array.isArray(o.routeStops)
      ? (o.routeStops as RouteStop[]).map((x) => ({
          city: s(x.city),
          country: s(x.country) || null,
          note: s(x.note) || null,
        }))
      : [],
    lines: Array.isArray(root.calcLines)
      ? (root.calcLines as Json[]).map((l) => ({
          key: String(l.id ?? Math.random()),
          article: (typeof l.article === 'string' ? l.article : 'freight') as CalcLineForm['article'],
          title: s(l.title),
          amount: l.amount === null || l.amount === undefined ? '' : String(l.amount),
          currency: s(l.currency) || 'RUB',
          fxRate: l.fxRateToOffer === null || l.fxRateToOffer === undefined ? '' : String(l.fxRateToOffer),
          comment: s(l.comment),
        }))
      : [],
    isPreliminary: o.isPreliminary === true,
  }
  return form
}

// Сборка тела POST/PATCH из формы. Валидация — здесь (тексты ошибок
// человекочитаемые, RULES 2.7); override-поля уходят ТОЛЬКО тронутые.
export function buildOptionSaveBody(
  form: OptionDialogForm,
  editing: boolean,
  routeDirty: Set<string>,
  cargoDirty: Set<string>,
  stopsTouched: boolean,
  wishesTouched: boolean
): { error?: string; body?: Record<string, unknown> } {
  const description = form.description.trim()
  const price = parseMoneyInput(form.price)
  const eta = Number(form.etaDays.replace(',', '.'))
  if (!description) return { error: 'Опишите вариант расчёта' }
  if (price === null) return { error: 'Цена — число, больше нуля, до 2 знаков после запятой' }
  if (!Number.isInteger(eta) || eta <= 0) return { error: 'Срок — целое число дней, больше нуля' }
  const lines = form.lines
    .map((l) => ({
      ...l,
      amountNum: parseMoneyInput(l.amount),
      fxNum: l.fxRate.trim() ? Number(l.fxRate.replace(',', '.')) : null,
    }))
    .filter((l) => l.amountNum !== null)
  if (
    lines.some(
      (l) =>
        l.amountNum === null ||
        (l.fxRate !== '' && (l.fxNum === null || !Number.isFinite(l.fxNum!) || l.fxNum! <= 0))
    )
  ) {
    return { error: 'Сумма строки — число; курс — число больше нуля' }
  }
  const dirty = <T extends object>(obj: T, keys: Set<string>): Record<string, unknown> | null => {
    if (keys.size === 0) return null
    const out: Record<string, unknown> = {}
    for (const k of keys) {
      const v = (obj as Record<string, unknown>)[k]
      out[k] = v === '' ? null : v
    }
    return out
  }
  const cargoBody = dirty(
    {
      ...form.cargo,
      dangerous: form.cargo.dangerous === 'yes' ? true : form.cargo.dangerous === 'no' ? false : '',
    },
    cargoDirty
  )
  const stops = stopsTouched
    ? form.stops
        .filter((s) => s.city.trim())
        .map((s) => ({ city: s.city.trim(), country: s.country || null, note: s.note?.trim() || null }))
    : null
  const cost = form.cost.trim() ? parseMoneyInput(form.cost) : null
  const body: Record<string, unknown> = {
    description,
    price,
    currency: form.currency,
    vatMode: form.vatMode,
    ...(editing ? { costEstimate: cost } : cost !== null ? { costEstimate: cost } : {}),
    costCurrency: form.costCurrency,
    etaDays: eta,
    priorityFit: form.priorityFit,
    ...(form.modes.length ? { transportModes: form.modes } : {}),
    ...(dirty(form.route, routeDirty) ? { route: dirty(form.route, routeDirty) } : {}),
    ...(cargoBody ? { cargo: cargoBody } : {}),
    ...(stopsTouched ? { routeStops: stops } : {}),
    ...(wishesTouched ? { wishes: form.route.wishes.trim() || null } : {}),
    ...(lines.length
      ? {
          calcLines: lines.map((l) => ({
            article: l.article,
            ...(l.title.trim() ? { title: l.title.trim() } : {}),
            amount: l.amountNum,
            currency: l.currency,
            ...(l.fxNum !== null ? { fxRateToOffer: l.fxNum } : {}),
            ...(l.comment.trim() ? { comment: l.comment.trim() } : {}),
          })),
        }
      : {}),
    ...(editing
      ? { isPreliminary: form.isPreliminary }
      : form.isPreliminary
        ? { isPreliminary: true }
        : {}),
  }
  return { body }
}
