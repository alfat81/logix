/**
 * Утилиты для нормализации и валидации телефона и email
 */

// Проверка: это email?
export function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

// Проверка: это email (строгая)?
export function isValidEmail(value: string): boolean {
  return /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(value.trim())
}

// Проверка: это нормализованный телефон? (+7XXXXXXXXXX)
export function isPhoneNormalized(value: string): boolean {
  return /^\+7\d{10}$/.test(value)
}

// Нормализация телефона в формат +7XXXXXXXXXX
export function normalizePhone(input: string): string | null {
  if (!input) return null
  const digits = input.replace(/\D/g, '')
  if (digits.length === 11 && (digits.startsWith('7') || digits.startsWith('8'))) {
    return '+7' + digits.slice(1)
  }
  if (digits.length === 10) {
    return '+7' + digits
  }
  return null
}

// Телефонные варианты поискового запроса (Ж7, переиспользован Ж6а).
// Пользователь набирает телефон как привык: «+7 900 555-01-07»,
// «89005550107», «9005550107». В Customer.phone телефон нормализован
// (+7XXXXXXXXXX), в Lead.rawContact — лежит как ввели. Поэтому кроме
// исходной строки ищем по «цифрам без разделителей» и варианту с
// ведущей 8→7: 3+ цифр достаточно, чтобы не ловить шум по «+7».
export function phoneVariants(q: string): string[] {
  const digits = q.replace(/\D/g, '')
  if (digits.length < 3) return []
  const out = new Set<string>([digits])
  if (digits.startsWith('8')) out.add('7' + digits.slice(1))
  const normalized = normalizePhone(q)
  if (normalized) out.add(normalized)
  return [...out]
}

// Маска телефона при вводе — форматирует по мере печатания
export function formatPhoneInput(input: string): string {
  let cleaned = input.replace(/[^\d+]/g, '')
  if (!cleaned) return ''
  if (!cleaned.startsWith('+')) {
    if (cleaned.startsWith('8')) cleaned = '7' + cleaned.slice(1)
    if (!cleaned.startsWith('7') && cleaned.length > 0) cleaned = '7' + cleaned
    cleaned = '+' + cleaned
  } else {
    if (cleaned.startsWith('+8')) cleaned = '+7' + cleaned.slice(2)
    if (cleaned.startsWith('+') && !cleaned.startsWith('+7') && cleaned.length > 1) cleaned = '+7' + cleaned.slice(1)
  }
  const digits = cleaned.replace(/\D/g, '')
  const limited = digits.slice(0, 11)
  let result = '+7'
  if (limited.length > 1) {
    result += ' (' + limited.slice(1, 4)
    if (limited.length >= 4) result += ') '
    if (limited.length > 4) result += limited.slice(4, 7)
    if (limited.length >= 7) result += '-' + limited.slice(7, 9)
    if (limited.length >= 9) result += '-' + limited.slice(9, 11)
  }
  return result
}
