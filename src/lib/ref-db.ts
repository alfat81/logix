import { db } from '@/lib/db'
import { CURRENCIES } from '@/lib/money'
import { matchRefOptions, normalizeRefCode, type RefDir, type RefOption } from '@/lib/ref'
import { routeToDbColumns, type RouteFieldsInput } from '@/lib/route-fields'

// ─── DF-17: серверное чтение справочников ────────────────────────────
// Единственная точка чтения RefItem для API и денормализации (RULES
// 2.15 — одно место знания). Публичный /api/ref/[dir] отдаёт активные
// записи всем авторизованным кабинетам; админский — все, включая
// отключённые (управление — /admin/references, DF-17).
//
// Активность проверяется НА МОМЕНТ ДЕЙСТВИЯ: мастер отключил валюту →
// новые строки с ней отвергаются, старые живут снимками (текстовые
// колонки/Json не переписываются задним числом).

const SEARCH_LIMIT_MAX = 200

export type RefListItem = RefOption & {
  id: string
  isActive: boolean
  sortOrder: number
  meta: unknown
}

export async function listRefItems(
  dir: RefDir,
  opts: { q?: string; limit?: number; activeOnly?: boolean } = {}
): Promise<RefListItem[]> {
  const limit = Math.min(Math.max(opts.limit ?? SEARCH_LIMIT_MAX, 1), SEARCH_LIMIT_MAX)
  const rows = await db.refItem.findMany({
    where: { dir, ...(opts.activeOnly ? { isActive: true } : {}) },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    select: { id: true, code: true, name: true, nameEn: true, meta: true, isActive: true, sortOrder: true },
  })
  const matched = matchRefOptions(rows, opts.q ?? '')
  return matched.slice(0, limit)
}

// Коды → имена: для денормализации текстовых колонок на записи и для
// проверки активности. Незнакомые/отключённые коды — в invalid.
// Возвращает также meta по кодам (Инкотермс: правила — данные).
export type ResolvedRefs = {
  names: Map<string, string>
  meta: Map<string, unknown>
  invalid: string[]
}

export async function resolveActiveRefs(dir: RefDir, codes: (string | null | undefined)[]): Promise<ResolvedRefs> {
  const wanted = [...new Set(codes.filter((c): c is string => typeof c === 'string' && c.trim() !== ''))].map(
    (c) => normalizeRefCode(dir, c)
  )
  const out: ResolvedRefs = { names: new Map(), meta: new Map(), invalid: [] }
  if (wanted.length === 0) return out
  const rows = await db.refItem.findMany({
    where: { dir, code: { in: wanted }, isActive: true },
    select: { code: true, name: true, meta: true },
  })
  const found = new Set(rows.map((r) => r.code))
  for (const r of rows) {
    out.names.set(r.code, r.name)
    out.meta.set(r.code, r.meta)
  }
  for (const c of wanted) if (!found.has(c)) out.invalid.push(c)
  return out
}

// Валидация валют схемы (QuoteOption/QuoteSnapshot): коды должны быть
// в справочнике и активны. Пустая таблица → запасной список money.ts
// (свежий деплой без сидажа не ломает формы — карточка DF-17).
export async function resolveActiveCurrencies(
  codes: (string | null | undefined)[]
): Promise<{ names: Map<string, string>; invalid: string[] }> {
  const wanted = [...new Set(codes.filter((c): c is string => typeof c === 'string' && c.trim() !== ''))]
  if (wanted.length === 0) return { names: new Map(), invalid: [] }
  const tableEmpty = (await db.refItem.count({ where: { dir: 'currency' } })) === 0
  if (tableEmpty) {
    const fallback = new Set(CURRENCIES as readonly string[])
    const names = new Map<string, string>(
      wanted.filter((c) => fallback.has(c)).map((c) => [c, c])
    )
    const invalid = wanted.filter((c) => !fallback.has(c))
    return { names, invalid }
  }
  const r = await resolveActiveRefs('currency', wanted)
  return { names: r.names, invalid: r.invalid }
}

// Активные валюты для форм (Combobox): из справочника; пустая таблица —
// запасной список (используется UI-фолбэком через /api/ref/currency —
// сам эндпоинт отдаёт и фолбэк, чтобы формы работали до сидажа).
export async function getActiveCurrencyOptions(): Promise<(RefListItem | { id: string; code: string; name: string; nameEn: string | null; meta: unknown; isActive: boolean; sortOrder: number })[]> {
  const rows = await listRefItems('currency', { activeOnly: true })
  if (rows.length > 0) return rows
  return (CURRENCIES as readonly string[]).map((code, i) => ({
    id: `fallback:${code}`,
    code,
    name: code,
    nameEn: null,
    meta: null,
    isActive: true,
    sortOrder: i,
  }))
}

// ─── Коды сделки одним вызовом (DF-17, RULES 2.15 — одно место знания) ──
// Единая валидация полей-кодов сделки: маршрут (страны) + условие
// поставки. Её вызывают POST/PATCH запроса и заявки (админ и клиент):
// незнакомый/отключённый код — { error } (роут отдаёт 400); иначе —
// колонки маршрута с денормализованными именами и нормализованный код
// Инкотермс (null = не задан/очистить; «поле не трогать» — решение
// роута: он знает, пришёл ли ключ в теле PATCH).
export type DealCodeColumns = NonNullable<Awaited<ReturnType<typeof resolveRouteColumns>>['columns']>

export async function resolveDealCodes(
  route: RouteFieldsInput | undefined,
  incotermCode: string | null | undefined
): Promise<
  | { columns: DealCodeColumns; incoterm: string | null; error?: undefined }
  | { columns?: undefined; incoterm?: undefined; error: string }
> {
  const routeResolved = await resolveRouteColumns(route)
  if (routeResolved.error) return { error: routeResolved.error }
  // маршрута может не быть (POST только с Инкотермс) — колонки пустые
  const columns = routeResolved.columns ?? {}
  if (!incotermCode) return { columns, incoterm: null }
  const incotermResolved = await resolveActiveRefs('incoterm', [incotermCode])
  if (incotermResolved.invalid.length > 0) {
    return { error: `Условие поставки не найдено в справочнике: ${incotermResolved.invalid.join(', ')}` }
  }
  return { columns, incoterm: normalizeRefCode('incoterm', incotermCode) }
}

// ─── Маршрут + справочник: колонки для prisma одним вызовом ─────────
// API-роуты лида/заявки валидируют коды стран и ДЕНОРМАЛИЗУЮТ имена в
// текстовые колонки одним вызовом (DF-17: клиент шлёт только код).
// Незнакомый/отключённый код — { error } → роут отдаёт 400 с текстом.
export async function resolveRouteColumns(
  route: RouteFieldsInput | undefined
): Promise<{ columns: ReturnType<typeof routeToDbColumns> & { originCountry?: string | null; destinationCountry?: string | null }; error?: undefined } | { columns?: undefined; error: string }> {
  const base = routeToDbColumns(route)
  if (!route) return { columns: base ?? {} }
  const resolved = await resolveActiveRefs(
    'country',
    [route.originCountryCode, route.destinationCountryCode]
  )
  if (resolved.invalid.length > 0) {
    return { error: `Страна не найдена в справочнике или отключена: ${resolved.invalid.join(', ')}` }
  }
  // Имена пишутся всегда, когда ключ пришёл (в т.ч. null = очистить
  // текстовую колонку вместе с кодом); undefined (ключа нет) — не трогаем.
  const names = await resolveCountryNames(route, resolved)
  return { columns: { ...(base ?? {}), ...names } }
}

// Имена для текстовых колонок: код есть → имя из справочника; код null
// → колонка тоже очищается (справочник — единственный источник страны,
// IC-16; легаси-тексты живут снимками, пока поле не трогают).
async function resolveCountryNames(
  route: RouteFieldsInput,
  resolved: { names: Map<string, string> }
): Promise<{ originCountry?: string | null; destinationCountry?: string | null }> {
  const out: { originCountry?: string | null; destinationCountry?: string | null } = {}
  if (route.originCountryCode !== undefined) {
    out.originCountry = route.originCountryCode
      ? (resolved.names.get(route.originCountryCode) ?? null)
      : null
  }
  if (route.destinationCountryCode !== undefined) {
    out.destinationCountry = route.destinationCountryCode
      ? (resolved.names.get(route.destinationCountryCode) ?? null)
      : null
  }
  return out
}
