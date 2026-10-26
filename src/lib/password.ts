import { randomBytes, scryptSync, timingSafeEqual } from 'crypto'

// Хеширование паролей через scrypt (встроенный node:crypto, без новых
// зависимостей). Формат введён с первого дня проекта: пароли никогда
// не хранятся открытым текстом.

const KEY_LENGTH = 64
const SALT_LENGTH = 16

// Формат хранимого значения: "scrypt:<salt-hex>:<hash-hex>". Префикс
// "scrypt:" отличает хеш от случайного значения другого формата.
const PREFIX = 'scrypt:'

export function hashPassword(plain: string): string {
  const salt = randomBytes(SALT_LENGTH).toString('hex')
  const hash = scryptSync(plain, salt, KEY_LENGTH).toString('hex')
  return `${PREFIX}${salt}:${hash}`
}

export function verifyPassword(plain: string, stored: string): boolean {
  if (!stored.startsWith(PREFIX)) {
    // Безопасность (DF-00): открытый текст больше не поддерживается.
    // Пароли без префикса scrypt: отвергаются.
    return false
  }
  const [, salt, hashHex] = stored.split(':')
  if (!salt || !hashHex) return false
  const hash = scryptSync(plain, salt, KEY_LENGTH)
  const storedHash = Buffer.from(hashHex, 'hex')
  if (hash.length !== storedHash.length) return false
  return timingSafeEqual(hash, storedHash)
}
