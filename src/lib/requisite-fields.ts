// ─── Поля реквизитов юрлица (Ж6б) ──────────────────────────────
// Клиент-безопасный модуль (паттерн lib/note-constants.ts и
// lib/search-constants.ts): используется только формами юрлиц
// (диалоги создания/правки LegalEntitiesList) и подстановкой ИНН
// в строку списка.
//
// ВАЖНО: это описание ФОРМЫ, а не структуры БД. requisites в
// LegalEntity остаётся Json свободной формы (роадмап, раздел 4:
// «не фиксировать точную структуру до реальных печатных форм») —
// сервер принимает любой объект со скалярными значениями. Форма
// лишь сохраняет только заполненные поля, чтобы Json не обрастал
// пустышками; когда придут реальные печатные бланки (Дорожка Е),
// сюда добавятся их поля без миграции БД.

export type RequisiteField = {
  key: string
  label: string
  placeholder: string
  // inputMode для мобильной клавиатуры: числовые реквизиты —
  // цифровая, адрес — текстовая.
  numeric?: boolean
}

export const REQUISITE_FIELDS: readonly RequisiteField[] = [
  { key: 'inn', label: 'ИНН', placeholder: '7701234567', numeric: true },
  { key: 'kpp', label: 'КПП', placeholder: '770101001', numeric: true },
  { key: 'ogrn', label: 'ОГРН', placeholder: '1157746123456', numeric: true },
  { key: 'address', label: 'Юридический адрес', placeholder: 'г. Москва, ул. Примерная, 1, оф. 2' },
  { key: 'bankName', label: 'Банк', placeholder: 'ПАО «Примербанк»' },
  { key: 'bankAccount', label: 'Расчётный счёт', placeholder: '40702810123450000123', numeric: true },
  { key: 'bik', label: 'БИК', placeholder: '044525123', numeric: true },
]

// ИНН — главный реквизит для строки списка (идентифицирует юрлицо
// лучше названия: «ООО Логистика» встречается у разных компаний).
export function requisitesInn(requisites: unknown): string | null {
  if (!requisites || typeof requisites !== 'object' || Array.isArray(requisites)) return null
  const inn = (requisites as Record<string, unknown>).inn
  if (typeof inn !== 'string' || !inn.trim()) return null
  return inn.trim()
}
