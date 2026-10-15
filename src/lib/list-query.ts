// ─── Эталонный паттерн списков Ж4 (LOGISTICS-REWORK-QUEUE, принцип 2) ──
// Один контракт «поиск ?q= + сортировка ?sort= + постраничность
// take/skip с hasMore + счётчики» для всех списков кабинета: заявки
// (Ж4), лиды (Ж5), клиенты и договоры (Ж6а). Здесь — общие части
// (парсинг параметров и регистронезависимый поиск); различаются списки
// только набором полей поиска и допустимых сортировок — их каждый роут
// передаёт сам, чтобы белый список сортировок был виден прямо в нём.

export const DEFAULT_LIST_TAKE = 20
export const MAX_LIST_TAKE = 100
export const MAX_QUERY_LENGTH = 200

export type ParsedListQuery = {
  // Поисковая строка: обрезана по длине, пробелы по краям убраны.
  q: string
  // Значение из белого списка allowedSorts (валидация — на месте).
  sort: string
  // Размер страницы: 1..MAX_LIST_TAKE (клампим молча — это числа из
  // нашего же UI, ломать ответ из-за take=0 не стоит).
  take: number
  // Смещение: >= 0.
  skip: number
}

// Парсинг параметров списка. Возвращает ошибку (строкой — роут отдаст
// её как 400), если sort не из белого списка: молчаливый откат скрыл
// бы опечатку в названии сортировки при копировании паттерна в Ж5/Ж6.
export function parseListQuery(
  params: URLSearchParams,
  options: { allowedSorts: readonly string[]; defaultSort: string }
): ParsedListQuery | { error: string } {
  const q = (params.get('q') ?? '').trim().slice(0, MAX_QUERY_LENGTH)
  const sort = params.get('sort') ?? options.defaultSort
  if (!options.allowedSorts.includes(sort)) {
    return { error: `Неизвестная сортировка: ${sort}` }
  }

  const rawTake = Number(params.get('take'))
  const rawSkip = Number(params.get('skip'))

  const take = Number.isFinite(rawTake) && params.get('take') !== null
    ? Math.min(Math.max(Math.trunc(rawTake), 1), MAX_LIST_TAKE)
    : DEFAULT_LIST_TAKE
  const skip = Number.isFinite(rawSkip) && params.get('skip') !== null
    ? Math.max(Math.trunc(rawSkip), 0)
    : 0

  return { q, sort, take, skip }
}

// ─── Регистронезависимый поиск для двух миров проекта ─────────────────
// Песочница живёт на SQLite, поставка и прод — PostgreSQL (Neon; см.
// zip-logix.sh: провайдер флипается в поставке). Пробником 13.10
// проверено: mode:'insensitive' на SQLite НЕ поддерживается (ошибка
// валидации Prisma), а на PostgreSQL без mode поиск по-русски теряет
// совпадения по регистру («логикс» не находит «Логикс»).
//
// Решение: на PostgreSQL добавляем mode:'insensitive', на SQLite —
// обычный contains. Для песочницы это честный размен: номера, телефоны
// и ТН ВЭД — ASCII (LIKE в SQLite для них регистронезависим), а кирил-
// ллица в тестах ищется точным регистром — приемлемо для мира тестов.

export function isSqliteDatabase(): boolean {
  return (process.env.DATABASE_URL ?? '').startsWith('file:')
}

// Тип — надстройка над Prisma StringFilter: в postgres-генерации клиент
// знает mode (QueryMode), в sqlite-генерации — нет; лишнее поле в
// неп литеральном объекте структурной типизацией пропускается, поэтому
// хелпер собирается в обоих мирах без cast-ов.
export function ciContains(q: string): { contains: string; mode?: 'insensitive' } {
  return isSqliteDatabase()
    ? { contains: q }
    : { contains: q, mode: 'insensitive' }
}
