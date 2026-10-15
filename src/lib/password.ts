import { randomBytes, scryptSync, timingSafeEqual } from 'crypto'

// Хеширование паролей через scrypt (встроенный node:crypto, без новых
// зависимостей). Перенесено из APEX Moto (0.4) — там этот модуль закрыл
// риск: пароли клиентов изначально хранились открытым текстом, что
// стало особенно критично после утечки DATABASE_URL через debug-роут.
// Здесь закладывается с первого дня, не как фикс задним числом.

const KEY_LENGTH = 64
const SALT_LENGTH = 16

// Формат хранимого значения: "scrypt:<salt-hex>:<hash-hex>"
// Префикс "scrypt:" явно отличает новый формат от возможного старого
// открытого текста при миграции (см. needsRehash).
const PREFIX = 'scrypt:'

export function hashPassword(plain: string): string {
  const salt = randomBytes(SALT_LENGTH).toString('hex')
  const hash = scryptSync(plain, salt, KEY_LENGTH).toString('hex')
  return `${PREFIX}${salt}:${hash}`
}

export function verifyPassword(plain: string, stored: string): boolean {
  if (!stored.startsWith(PREFIX)) {
    // Старый формат (открытый текст) — путь для миграции на лету,
    // см. needsRehash. Сравнение timing-safe даже здесь: не даёт повода
    // экономить осторожность там, где она дешёвая.
    return timingSafeEqualStrings(plain, stored)
  }
  const [, salt, hashHex] = stored.split(':')
  if (!salt || !hashHex) return false
  const hash = scryptSync(plain, salt, KEY_LENGTH)
  const storedHash = Buffer.from(hashHex, 'hex')
  if (hash.length !== storedHash.length) return false
  return timingSafeEqual(hash, storedHash)
}

// true — значение в БД ещё не в формате scrypt (старый открытый текст
// или пришло из внешнего импорта). Вызывающий код при успешном логине
// должен тут же пересохранить hashPassword(plain) — миграция без
// принудительного сброса паролей всем сразу.
export function needsRehash(stored: string): boolean {
  return !stored.startsWith(PREFIX)
}

function timingSafeEqualStrings(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) {
    // Длины не совпадают — сравнить буфер с самим собой той же длины,
    // чтобы время выполнения не выдавало длину секрета по времени ответа.
    timingSafeEqual(bufA, bufA)
    return false
  }
  return timingSafeEqual(bufA, bufB)
}
