import { ACTIVITY_TYPES } from '@/lib/activity'

// ─── DF-00D: валидаторы значений настроек ────────────────────────────
// Вынесены из settings.ts ради лимита 300 строк (RULES 2.14): реестр
// и get/set — в settings.ts, чистые функции проверки — здесь. Каждый
// валидатор НОРМАЛИЗУЕТ значение (trim, сортировка, дедупликация) или
// бросает SettingValidationError с сообщением для мастера; сообщения
// без имени ключа — API добавит подпись настройки.
// Файл чистый (без db) — пригоден для клиентского использования в Блоке 4.

// Ошибка валидации/неизвестного ключа: API /api/admin/settings
// отображает её в 400 (Блок 4).
export class SettingValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SettingValidationError'
  }
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function asNonEmptyStr(v: unknown, maxLen: number): string {
  if (typeof v !== 'string') throw new SettingValidationError('Ожидается строка')
  const s = v.trim()
  if (!s) throw new SettingValidationError('Значение не может быть пустым')
  if (s.length > maxLen) throw new SettingValidationError(`Не длиннее ${maxLen} символов`)
  return s
}

// Пустая строка легитимна («не задано»): brand.signature, email.reply_to.
export function asOptionalStr(v: unknown, maxLen: number): string {
  if (typeof v !== 'string') throw new SettingValidationError('Ожидается строка')
  const s = v.trim()
  if (s.length > maxLen) throw new SettingValidationError(`Не длиннее ${maxLen} символов`)
  return s
}

export function asTime(v: unknown): string {
  const s = asNonEmptyStr(v, 5)
  if (!TIME_RE.test(s)) throw new SettingValidationError('Время в формате ЧЧ:ММ, например 09:00')
  return s
}

export function asTimeList(v: unknown): string[] {
  if (!Array.isArray(v) || v.length === 0) throw new SettingValidationError('Нужен хотя бы один час')
  const out = v.map((x) => asTime(x))
  const uniq = [...new Set(out)]
  if (uniq.length !== out.length) throw new SettingValidationError('Часы не должны повторяться')
  return uniq.sort() // нули дополнены — строковая сортировка = хронологическая
}

export function asStringList(v: unknown, min: number, max: number, maxLen: number): string[] {
  if (!Array.isArray(v)) throw new SettingValidationError('Ожидается список значений')
  if (v.length < min || v.length > max) throw new SettingValidationError(`От ${min} до ${max} пунктов`)
  const out = v.map((x) => {
    if (typeof x !== 'string') throw new SettingValidationError('Пункты списка — строки')
    const s = x.trim()
    if (!s) throw new SettingValidationError('Пустые пункты не допускаются')
    if (s.length > maxLen) throw new SettingValidationError(`Пункт длиннее ${maxLen} символов`)
    return s
  })
  const uniq = [...new Set(out)]
  if (uniq.length !== out.length) throw new SettingValidationError('Пункты не должны повторяться')
  return uniq
}

export function asInt(v: unknown, min: number, max: number): number {
  if (typeof v !== 'number' || !Number.isInteger(v)) throw new SettingValidationError('Ожидается целое число')
  if (v < min || v > max) throw new SettingValidationError(`Число от ${min} до ${max}`)
  return v
}

export function asTimezone(v: unknown): string {
  const s = asNonEmptyStr(v, 64)
  try {
    new Intl.DateTimeFormat('ru-RU', { timeZone: s })
  } catch {
    throw new SettingValidationError('Неизвестный часовой пояс IANA, например Europe/Moscow')
  }
  return s
}

export function asOptionalEmail(v: unknown): string {
  const s = asOptionalStr(v, 200)
  if (s && !EMAIL_RE.test(s)) throw new SettingValidationError('Адрес почты или пустое значение')
  return s
}

export function asOneOf(v: unknown, allowed: readonly string[]): string {
  const s = asNonEmptyStr(v, 40)
  if (!allowed.includes(s)) throw new SettingValidationError(`Одно из значений: ${allowed.join(', ')}`)
  return s
}

// Коды «красных» событий — только из реестра ACTIVITY_TYPES: свободный
// код диспетчер писем (DF-03) не поймёт. Пустой список легитимен:
// красных событий в системе пока нет (появятся в DF-05/DF-16).
export function asEventCodeList(v: unknown): string[] {
  const list = asStringList(v, 0, 20, 50)
  for (const code of list) {
    if (!(ACTIVITY_TYPES as readonly string[]).includes(code)) {
      throw new SettingValidationError(`«${code}» — не код из реестра событий`)
    }
  }
  return list
}
