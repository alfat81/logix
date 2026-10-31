import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto'

// ─── DF-09: криптография TOTP-контура ────────────────────────────────
// Ключ один — env TOTP_ENCRYPTION_KEY (секрет → env по D32/§4.3):
//  • шифрование TOTP-секрета AES-256-GCM (AAD = id сотрудника — шифро-
//    текст привязан к учётке, подмена между аккаунтами не расшифровывается);
//  • подпись challenge второго шага входа (HMAC-SHA256, срок 5 минут).
// Ключи выводятся scrypt'ом с разными salt и кэшируются на процесс.
// Без TOTP_ENCRYPTION_KEY всё точно падает (fail closed) — см.
// TotpNotConfiguredError: включение TOTP и второй шаг входа требуют
// ключа, обычный вход без включённого TOTP не затронут.

export class TotpNotConfiguredError extends Error {
  constructor() {
    super('TOTP_ENCRYPTION_KEY не настроен на сервере')
    this.name = 'TotpNotConfiguredError'
  }
}

const CHALLENGE_TTL_MS = 5 * 60 * 1000

let cachedKeys: { enc: Buffer; mac: Buffer } | null = null

function deriveKeys(): { enc: Buffer; mac: Buffer } {
  if (cachedKeys) return cachedKeys
  const secret = process.env.TOTP_ENCRYPTION_KEY
  if (!secret) throw new TotpNotConfiguredError()
  cachedKeys = {
    // scrypt от УЖЕ случайного длинного ключа env (не от пароля) —
    // дефолтные параметры достаточны и не упираются в maxmem Node
    enc: scryptSync(secret, 'logix-totp-enc-v1', 32),
    mac: scryptSync(secret, 'logix-totp-challenge-v1', 32),
  }
  return cachedKeys
}

// Формат: v1:<iv>:<ciphertext>:<tag> — base64. Формат в колонке виден
// администратору БД, но без ключа это лишь случайные байты.
export function encryptTotpSecret(plainB32: string, aad: string): string {
  const { enc } = deriveKeys()
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', enc, iv)
  cipher.setAAD(Buffer.from(aad))
  const ct = Buffer.concat([cipher.update(plainB32, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `v1:${iv.toString('base64')}:${ct.toString('base64')}:${tag.toString('base64')}`
}

export function decryptTotpSecret(blob: string, aad: string): string {
  const { enc } = deriveKeys()
  const [v, ivB64, ctB64, tagB64] = blob.split(':')
  if (v !== 'v1' || !ivB64 || !ctB64 || !tagB64) throw new Error('Неизвестный формат TOTP-секрета')
  const decipher = createDecipheriv('aes-256-gcm', enc, Buffer.from(ivB64, 'base64'))
  decipher.setAAD(Buffer.from(aad))
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'))
  return Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64')), decipher.final()]).toString(
    'utf8'
  )
}

export type TotpChallenge = { employeeId: string; phone: string; exp: number }

const b64url = (buf: Buffer): string => buf.toString('base64url')

/** Одноразовая «заявка» второго шага: подписана, живёт 5 минут. */
export function issueTotpChallenge(payload: Omit<TotpChallenge, 'exp'>): string {
  const { mac } = deriveKeys()
  const full: TotpChallenge = { ...payload, exp: Date.now() + CHALLENGE_TTL_MS }
  const body = b64url(Buffer.from(JSON.stringify(full)))
  const sig = b64url(createHmac('sha256', mac).update(body).digest())
  return `${body}.${sig}`
}

/** null — подпись неверна или срок вышел; валидность учётки проверяет БД. */
export function verifyTotpChallenge(token: string): TotpChallenge | null {
  const { mac } = deriveKeys()
  const dot = token.indexOf('.')
  if (dot <= 0) return null
  const body = token.slice(0, dot)
  const sig = Buffer.from(token.slice(dot + 1), 'base64url')
  const expected = createHmac('sha256', mac).update(body).digest()
  if (sig.length !== expected.length || !timingSafeEqual(sig, expected)) return null
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as TotpChallenge
    if (typeof payload.employeeId !== 'string' || typeof payload.phone !== 'string') return null
    if (typeof payload.exp !== 'number' || payload.exp < Date.now()) return null
    return payload
  } catch {
    return null
  }
}
