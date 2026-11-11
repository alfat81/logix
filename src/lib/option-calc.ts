// ─── DF-27 волна 1: реестр статей расчёта варианта и итоги ─────────
// (ТЗ §5; план v1.2 §5). Файл БЕЗ серверных зависимостей: импортируют
// API-роуты, GET-проекции, UI и unit-тесты.
//
// Реестр статей — в коде (правило реестров — инвариант 9 RULES):
// строки расчёта варианта ссылаются на статью по коду, подписи —
// только из словаря LABELS (RULES 2.14: enum → текст из словарей).
//
// Деньги (RULES 2.15): суммы — Decimal в БД, арифметика итогов —
// целыми сотыми (без float-дрейфа), с unit-тестами на округление и
// валюты; формат отображения — только formatMoney (lib/money.ts).

export const OPTION_CALC_ARTICLES = [
  'freight',
  'terminal',
  'handling',
  'customs',
  'broker',
  'insurance',
  'lastMile',
  'other',
] as const

export type OptionCalcArticle = (typeof OPTION_CALC_ARTICLES)[number]

export const OPTION_CALC_ARTICLE_LABELS: Record<OptionCalcArticle, string> = {
  freight: 'Фрахт',
  terminal: 'Терминальные / СВХ',
  handling: 'Обработка груза',
  customs: 'Таможенные платежи',
  broker: 'Брокер / декларант',
  insurance: 'Страхование',
  lastMile: 'Доставка до получателя',
  other: 'Прочее',
}

export function isOptionCalcArticle(v: unknown): v is OptionCalcArticle {
  return typeof v === 'string' && (OPTION_CALC_ARTICLES as readonly string[]).includes(v)
}

// Источник строки: ручной ввод либо снимок версии таможенного расчёта
export const OPTION_CALC_SOURCES = ['manual', 'customs_version'] as const

// Строка расчёта в суммировании (Decimal из БД приходит как объект с
// toNumber, в API — строкой): принимаем все три представления
export type MoneyValue = number | string | { toNumber?: () => number }

export type OptionCalcLineLike = {
  amount: MoneyValue
  currency: string
  fxRateToOffer: MoneyValue | null
  amountOffer: MoneyValue | null
  // Статья расчёта (неизвестная → other); Prisma-строки её содержат
  article?: unknown
}

function toNum(v: MoneyValue | null | undefined): number {
  if (v === null || v === undefined) return NaN
  if (typeof v === 'object') {
    if (typeof v.toNumber === 'function') {
      const n = v.toNumber()
      return Number.isFinite(n) ? n : NaN
    }
    return NaN
  }
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : v
  return Number.isFinite(n) ? n : NaN
}

// Сумма в сотых (целые) — без float-дрейфа на копейках
function sumKopecks(values: number[]): number {
  return values.reduce((acc, v) => acc + Math.round(v * 100), 0)
}

export type OptionCalcTotals = {
  // Суммы по статьям — в валюте предложения (2 знака, число для UI)
  byArticle: Record<string, number>
  // Всего по строкам расчёта — в валюте предложения
  total: number
}

// Итоги транспортного расчёта варианта: каждая строка приводится к
// валюте предложения — amountOffer, если задан; иначе amount × курс
// (fxRateToOffer); строка в валюте предложения — как есть. Округление
// приведения — до 2 знаков (последний множитель, правило копеек).
export function sumOptionCalc(
  lines: OptionCalcLineLike[],
  offerCurrency: string
): OptionCalcTotals {
  const byArticle: Record<string, number> = {}
  let totalKop = 0
  for (const line of lines) {
    const amount = toNum(line.amount)
    if (!Number.isFinite(amount)) continue
    let offer: number
    if (line.currency === offerCurrency) {
      offer = amount
    } else {
      const explicit = toNum(line.amountOffer)
      const rate = toNum(line.fxRateToOffer)
      if (Number.isFinite(explicit) && explicit > 0) {
        offer = explicit
      } else if (Number.isFinite(rate) && rate > 0) {
        offer = Math.round(amount * rate * 100) / 100
      } else {
        // Курс не задан — строка не приводится к валюте предложения
        continue
      }
    }
    const article = line.article
    const key = typeof article === 'string' && isOptionCalcArticle(article) ? article : 'other'
    byArticle[key] = (byArticle[key] ?? 0) + offer
    totalKop += Math.round(offer * 100)
  }
  // Денежная арифметика — целыми сотыми (RULES 2.15: без float-дрейфа)
  const byArticleRounded: Record<string, number> = {}
  for (const [k, v] of Object.entries(byArticle)) {
    byArticleRounded[k] = sumKopecks([v]) / 100
  }
  return { byArticle: byArticleRounded, total: totalKop / 100 }
}

// Приведение строки к валюте предложения (сервер, при записи строки):
// валюта строки = валюте предложения → сумма как есть (курс null);
// задан курс → amount × rate с округлением до 2 знаков; иначе null
// (строка не приводится — итог её не считает).
export function computeAmountOffer(
  amount: number,
  currency: string,
  fxRateToOffer: number | null,
  offerCurrency: string
): { amountOffer: number | null; fxRateToOffer: number | null } {
  if (currency === offerCurrency) return { amountOffer: amount, fxRateToOffer: null }
  if (fxRateToOffer !== null && Number.isFinite(fxRateToOffer) && fxRateToOffer > 0) {
    return {
      amountOffer: Math.round(amount * fxRateToOffer * 100) / 100,
      fxRateToOffer,
    }
  }
  return { amountOffer: null, fxRateToOffer: null }
}

// Сверка расчёта с себестоимостью (ТЗ §5, план §5.3): расхождение суммы
// строк и costEstimate — не ошибка, а предупреждение (costEstimate —
// ручное внутреннее поле сотрудника).
export function calcMismatch(
  totals: OptionCalcTotals | null,
  costEstimate: MoneyValue | null | undefined
): number | null {
  if (!totals) return null
  const cost = toNum(costEstimate ?? null)
  if (!Number.isFinite(cost) || cost <= 0) return null
  return Math.round(totals.total * 100) / 100 - Math.round(cost * 100) / 100
}
