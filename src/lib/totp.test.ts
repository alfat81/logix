import { describe, it, expect } from 'vitest'
import {
  base32Decode,
  base32Encode,
  generateRecoveryCode,
  generateTotpSecret,
  hotp,
  normalizeRecoveryCode,
  otpauthUri,
  totpAt,
  TOTP_STEP_SEC,
  verifyTotp,
} from './totp'
import { encodeQr, qrSvg } from './qr'

// ─── DF-09: TOTP (RFC 6238/4226), base32, otpauth://, QR ─────────────
// Чистые функции без БД. RFC-векторы — эталон корректности HMAC-цепочки;
// QR проверяется структурой (искатели/размер) + машинной декодировкой
// zxing-cpp в песочнице (scripts/tmp-qr-verify/, единожды при релизе).

describe('totp: base32 (RFC 4648)', () => {
  it('кодирует и декодирует в обе стороны', () => {
    const buf = Buffer.from([0, 1, 2, 250, 251, 77, 200])
    expect(base32Decode(base32Encode(buf)).equals(buf)).toBe(true)
  })
  it('декодирует без паддинга и мусора, верхний регистр', () => {
    // «GEZDGNBV» = 8 символов base32 = 5 байт = «12345» (RFC 4226 secret prefix)
    expect(base32Decode('gezd-gnbv!').toString()).toBe('12345')
  })
})

describe('totp: HOTP/TOTP (RFC 4226 §D, secret = «12345678901234567890»)', () => {
  const SECRET = base32Encode(Buffer.from('12345678901234567890', 'ascii'))

  it('эталонные счётчики HOTP 0, 5, 9', () => {
    expect(hotp(SECRET, 0)).toBe('755224')
    expect(hotp(SECRET, 5)).toBe('254676')
    expect(hotp(SECRET, 9)).toBe('520489')
  })

  it('TOTP на фикс. времени: шаг = floor(t/30)', () => {
    // counter 1 (t = 30..59 c) = HOTP(1) = 287082
    expect(totpAt(SECRET, 45_000)).toBe(hotp(SECRET, 1))
    expect(totpAt(SECRET, (TOTP_STEP_SEC * 123 + 5) * 1000)).toBe(hotp(SECRET, 123))
  })

  it('verifyTotp: код текущего и соседних шагов принимается', () => {
    const t = 1_000_000_000_000
    const step = Math.floor(t / 1000 / TOTP_STEP_SEC)
    expect(verifyTotp(SECRET, hotp(SECRET, step), { timeMs: t })).toEqual({ ok: true, step })
    expect(verifyTotp(SECRET, hotp(SECRET, step - 1), { timeMs: t })).toEqual({
      ok: true,
      step: step - 1,
    })
    expect(verifyTotp(SECRET, hotp(SECRET, step + 1), { timeMs: t })).toEqual({
      ok: true,
      step: step + 1,
    })
  })

  it('verifyTotp: чужой код, мусор и шаг ≤ minStep отклоняются', () => {
    const t = 1_000_000_000_000
    const step = Math.floor(t / 1000 / TOTP_STEP_SEC)
    expect(verifyTotp(SECRET, '000000', { timeMs: t }).ok).toBe(false)
    expect(verifyTotp(SECRET, '12ab', { timeMs: t }).ok).toBe(false)
    expect(verifyTotp(SECRET, '1234567', { timeMs: t }).ok).toBe(false)
    // окно ±1: коды шагов ≤ minStep не рассматриваются вовсе
    expect(verifyTotp(SECRET, hotp(SECRET, step - 1), { timeMs: t, minStep: step }).ok).toBe(false)
    expect(verifyTotp(SECRET, hotp(SECRET, step), { timeMs: t, minStep: step }).ok).toBe(false)
    expect(verifyTotp(SECRET, hotp(SECRET, step + 1), { timeMs: t, minStep: step }).ok).toBe(true)
  })
})

describe('totp: секреты, uri, коды восстановления', () => {
  it('generateTotpSecret: 32 символа base32, уникален', () => {
    const s = generateTotpSecret()
    expect(s).toMatch(/^[A-Z2-7]{32}$/)
    expect(generateTotpSecret()).not.toBe(s)
  })

  it('otpauthUri: label issuer:account, все параметры на месте', () => {
    const uri = otpauthUri({ secret: 'ABC23456', account: 'Иван', issuer: 'Logix' })
    expect(uri.startsWith('otpauth://totp/')).toBe(true)
    expect(uri).toContain(encodeURIComponent('Logix:Иван'))
    expect(uri).toContain('secret=ABC23456')
    expect(uri).toContain('issuer=Logix')
    expect(uri).toContain('algorithm=SHA1')
    expect(uri).toContain('digits=6')
    expect(uri).toContain('period=30')
  })

  it('код восстановления: формат XXXX-XXXX, без путаных символов', () => {
    for (let i = 0; i < 20; i++) {
      const c = generateRecoveryCode()
      // алфавит генерации уже base32: без I/L/O и без 0/1 — не путаются при списывании
      expect(c).toMatch(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/)
    }
    expect(normalizeRecoveryCode(' ab23-45cd ')).toBe('AB2345CD')
    expect(normalizeRecoveryCode('ab23-45cd')).toBe(normalizeRecoveryCode('AB2345CD'))
  })
})

describe('qr: структура матрицы (ISO 18004)', () => {
  it('размер по версии, детерминирован', () => {
    const uri = 'otpauth://totp/Logix:test?secret=ABC23456ABC23456ABC23456ABC23456'
    const a = encodeQr(uri)
    const b = encodeQr(uri)
    expect(a).toEqual(b)
    // 65 байт: v4-M вмещает 62 → версия 5 (37×37)
    expect(a.size).toBe(37)
  })

  it('искательные шаблоны 7×7 в трёх углах', () => {
    const { size, modules } = encodeQr('hello')
    const finder = (r0: number, c0: number) => {
      // кромка 7×7 — тёмное кольцо
      for (let i = 0; i < 7; i++) {
        expect(modules[r0][c0 + i]).toBe(true)
        expect(modules[r0 + 6][c0 + i]).toBe(true)
        expect(modules[r0 + i][c0]).toBe(true)
        expect(modules[r0 + i][c0 + 6]).toBe(true)
      }
      // внутреннее белое кольцо и тёмный центр 3×3
      expect(modules[r0 + 1][c0 + 1]).toBe(false)
      expect(modules[r0 + 1][c0 + 5]).toBe(false)
      expect(modules[r0 + 5][c0 + 1]).toBe(false)
      expect(modules[r0 + 5][c0 + 5]).toBe(false)
      expect(modules[r0 + 2][c0 + 2]).toBe(true)
      expect(modules[r0 + 3][c0 + 3]).toBe(true)
      expect(modules[r0 + 4][c0 + 4]).toBe(true)
      // разделитель — светлая рамка (за краем матрицы клетки нет)
      expect(modules[r0 - 1]?.[c0] ?? false).toBe(false)
      expect(modules[r0 + 7]?.[c0] ?? false).toBe(false)
      expect(modules[r0]?.[c0 - 1] ?? false).toBe(false)
      expect(modules[r0]?.[c0 + 7] ?? false).toBe(false)
    }
    finder(0, 0)
    finder(0, size - 7)
    finder(size - 7, 0)
  })

  it('тёмный модуль и синхро-линия', () => {
    const { size, modules } = encodeQr('hello')
    expect(modules[size - 8][8]).toBe(true)
    for (let i = 8; i < size - 8; i++) {
      expect(modules[6][i]).toBe(i % 2 === 0)
      expect(modules[i][6]).toBe(i % 2 === 0)
    }
  })

  it('qrSvg: SVG с тихой зоной и путём модулей (токен currentColor — IC-09)', () => {
    const svg = qrSvg('hello')
    expect(svg).toContain('<svg')
    expect(svg).toContain('viewBox="0 0 29 29"') // v1: 21 + 4×2 тихая зона
    expect(svg).toContain('<path d="M')
    expect(svg).toContain('fill="currentColor"')
    expect(svg).not.toMatch(/#[0-9a-fA-F]{3,6}/) // hex вне globals.css запрещён
  })
})
