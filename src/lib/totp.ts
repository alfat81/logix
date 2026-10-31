import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

// ─── DF-09: TOTP (RFC 6238) на node:crypto — без зависимостей ────────
// Карточка DF-09 (G1: rg totp/otpauth по src и docs/INVENTORY.md —
// готового инструмента нет; зависимости без согласования запрещены
// §4.3). Параметры по умолчанию — де-факто стандарт аутентификаторов:
// HMAC-SHA1, 6 цифр, шаг 30 с, окно проверки ±1 шаг.

// RFC 4648 base32 (A–Z, 2–7): секрет хранится и передаётся в этом виде.
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

export function base32Encode(buf: Buffer): string {
  let bits = 0
  let value = 0
  let out = ''
  for (const byte of buf) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 31]
  return out
}

export function base32Decode(s: string): Buffer {
  const clean = s.toUpperCase().replace(/[^A-Z2-7]/g, '')
  let bits = 0
  let value = 0
  const bytes: number[] = []
  for (const ch of clean) {
    value = (value << 5) | BASE32_ALPHABET.indexOf(ch)
    bits += 5
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  return Buffer.from(bytes)
}

// Секрет — 20 случайных байт (160 бит, рекомендация RFC 4226 §4).
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20))
}

// RFC 4226 HOTP: HMAC-SHA1(key, 8-байтовый counter BE) → динамическое
// усечение → digits цифр.
export function hotp(secretB32: string, counter: number, digits = 6): string {
  const buf = Buffer.alloc(8)
  buf.writeBigUInt64BE(BigInt(counter))
  const h = createHmac('sha1', base32Decode(secretB32)).update(buf).digest()
  const offset = h[h.length - 1] & 0x0f
  const bin =
    ((h[offset] & 0x7f) << 24) |
    ((h[offset + 1] & 0xff) << 16) |
    ((h[offset + 2] & 0xff) << 8) |
    (h[offset + 3] & 0xff)
  return String(bin % 10 ** digits).padStart(digits, '0')
}

export const TOTP_STEP_SEC = 30

export function totpStepAt(timeMs: number, stepSec = TOTP_STEP_SEC): number {
  return Math.floor(timeMs / 1000 / stepSec)
}

export function totpAt(secretB32: string, timeMs: number, stepSec = TOTP_STEP_SEC): string {
  return hotp(secretB32, totpStepAt(timeMs, stepSec))
}

export type TotpVerifyResult =
  | { ok: true; step: number }
  | { ok: false }

/**
 * Проверка кода с окном ±1 шаг (калибровка часов устройства).
 * Возвращает matched step — вызывающий отбрасывает коды шага
 * ≤ totpLastStep (RFC 6238 §5.2: успешный код не принимается второй раз).
 * Сравнение — timingSafeEqual, чтобы не открывать тайминг-оракул.
 */
export function verifyTotp(
  secretB32: string,
  code: string,
  opts: { timeMs?: number; stepSec?: number; minStep?: number } = {}
): TotpVerifyResult {
  const normalized = code.replace(/\D/g, '')
  if (normalized.length !== 6) return { ok: false }
  const stepSec = opts.stepSec ?? TOTP_STEP_SEC
  const current = totpStepAt(opts.timeMs ?? Date.now(), stepSec)
  for (const drift of [0, -1, 1]) {
    const step = current + drift
    if (opts.minStep !== undefined && step <= opts.minStep) continue
    const expected = hotp(secretB32, step, 6)
    const a = Buffer.from(normalized)
    const b = Buffer.from(expected)
    if (a.length === b.length && timingSafeEqual(a, b)) return { ok: true, step }
  }
  return { ok: false }
}

// Key URI Format (github.com/google/authenticator-specs): заголовок
// «issuer:account», issuer и в пути, и в query — так приложение не
// спрашивает имя вручную. Параметры SHA1/6/30 — значения по умолчанию
// стандарта, но указываем явно: часть приложений показывает их в UI.
export function otpauthUri(params: {
  secret: string
  account: string
  issuer?: string
}): string {
  const issuer = params.issuer ?? 'Logix'
  const label = encodeURIComponent(`${issuer}:${params.account}`)
  const query = new URLSearchParams({
    secret: params.secret,
    issuer,
    algorithm: 'SHA1',
    digits: '6',
    period: String(TOTP_STEP_SEC),
  })
  return `otpauth://totp/${label}?${query.toString()}`
}

// Нормализация кода восстановления DF-09: «abcd-efgh» → «ABCDEFGH».
// Хеш хранится в TotpRecoveryCode.codeHash (sha256), сам код — только
// в ответе включения TOTP, второй раз не показывается.
export function normalizeRecoveryCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
}

const RECOVERY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // без I, L, O, 0/1 — не путаются при списывании

export function generateRecoveryCode(): string {
  const bytes = randomBytes(8)
  let code = ''
  for (let i = 0; i < 8; i++) code += RECOVERY_ALPHABET[bytes[i] % RECOVERY_ALPHABET.length]
  return `${code.slice(0, 4)}-${code.slice(4)}`
}
