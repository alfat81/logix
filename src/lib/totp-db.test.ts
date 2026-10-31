import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { db } from './db'
import { hashPassword } from './password'
import {
  createTotpSetup,
  disableTotp,
  enableTotp,
  revokeAllSessions,
  TotpCodeMismatchError,
  verifyTotpSecondStep,
} from './totp-db'
import { decryptTotpSecret, encryptTotpSecret } from './totp-crypto'
import { generateTotpSecret, hotp, normalizeRecoveryCode, TOTP_STEP_SEC } from './totp'
import { createHash } from 'node:crypto'

// ─── DF-09: интеграционный уровень (PostgreSQL, как settings.test.ts) ──
// Включение/выключение (события в транзакции), шифрование секрета
// (дамп без ключа секретов не раскрывает), второй шаг: окно, повтор
// шага (RFC 6238 §5.2), одноразовость кода восстановления, выход на
// всех устройствах. Строки скоупятся префиксом RUN (урок 0.7.7:
// параллельные файлы общей БД).

process.env.TOTP_ENCRYPTION_KEY ||= 'vitest-df09-totp-encryption-key'

const RUN = 'df09-totp-test'
const PHONE = `+7909${String(Date.now()).slice(-7)}`
let empId = ''

beforeAll(async () => {
  const emp = await db.employee.create({
    data: {
      name: `DF09 тест ${RUN}`,
      phone: PHONE,
      password: hashPassword('df09-pass-1'),
      roles: '["manager"]',
    },
  })
  empId = emp.id
})

afterAll(async () => {
  await db.employee.deleteMany({ where: { phone: PHONE } })
})

function currentCode(secret: string, offset = 0): string {
  return hotp(secret, Math.floor(Date.now() / 1000 / TOTP_STEP_SEC) + offset)
}

describe('df-09: включение TOTP и шифрование секрета', () => {
  it('createTotpSetup: секрет 32 base32, uri и QR на месте (account — телефон)', () => {
    const setup = createTotpSetup({ id: empId, name: 'DF09', roles: ['manager'] }, PHONE)
    expect(setup.secret).toMatch(/^[A-Z2-7]{32}$/)
    // URI — ASCII-телефон: гарантия «влезает в QR» для любых имён (IC-09 не касается)
    expect(setup.otpauthUri).toContain(encodeURIComponent(PHONE))
    expect(Buffer.byteLength(setup.otpauthUri)).toBeLessThanOrEqual(152)
    expect(setup.qrSvg).toContain('<svg')
  })

  it('неверный код включения отклоняется, состояние не меняется', async () => {
    const secret = generateTotpSecret()
    await expect(enableTotp({ id: empId, name: 'DF09', roles: ['manager'] }, secret, '000000')).rejects.toBeInstanceOf(
      TotpCodeMismatchError
    )
    const row = await db.employee.findUnique({ where: { id: empId } })
    expect(row?.totpEnabledAt).toBeNull()
  })

  it('верный код: секрет зашифрован (v1:…), 10 кодов восстановления, событие в БД', async () => {
    const secret = generateTotpSecret()
    const codes = await enableTotp(
      { id: empId, name: 'DF09 тест', roles: ['manager'] },
      secret,
      currentCode(secret)
    )
    expect(codes).toHaveLength(10)
    for (const c of codes) expect(c).toMatch(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/)

    const row = await db.employee.findUnique({ where: { id: empId } })
    expect(row?.totpEnabledAt).not.toBeNull()
    expect(row?.totpSecret?.startsWith('v1:')).toBe(true)
    // дамп без ключа секрет не отдаёт: в колонке нет ни открытого base32,
    // ни его расшифровки — шифротекст привязан к учётке (AAD)
    expect(row?.totpSecret).not.toContain(secret)
    expect(row?.totpSecret).not.toContain(empId)

    const stored = row?.totpSecret ?? ''
    expect(decryptTotpSecret(stored, empId)).toBe(secret)
    // чужой AAD (подмена секрета между учётками) не расшифровывается
    expect(() => decryptTotpSecret(stored, 'another-employee')).toThrow()

    const hashes = codes.map((c) => createHash('sha256').update(normalizeRecoveryCode(c)).digest('hex'))
    const storedCodes = await db.totpRecoveryCode.findMany({ where: { employeeId: empId } })
    expect(storedCodes).toHaveLength(10)
    expect(storedCodes.map((s) => s.codeHash).sort()).toEqual(hashes.sort())
    for (const s of storedCodes) expect(s.usedAt).toBeNull()

    const ev = await db.activity.findFirst({
      where: { type: 'totp_enabled', actorId: empId },
    })
    expect(ev).not.toBeNull()
    expect(ev?.audience).toEqual(['staff'])
  })
})

describe('df-09: второй шаг входа', () => {
  it('код TOTP принимается, повтор того же шага — нет (RFC 6238 §5.2)', async () => {
    const row = await db.employee.findUnique({ where: { id: empId } })
    const secret = decryptTotpSecret(row!.totpSecret!, empId)

    const first = await verifyTotpSecondStep(empId, currentCode(secret))
    expect(first.ok).toBe(true)
    if (first.ok) expect(first.usedRecovery).toBe(false)

    // тот же код немедленно — шаг ≤ totpLastStep, отклонён
    const replay = await verifyTotpSecondStep(empId, currentCode(secret))
    expect(replay.ok).toBe(false)
  })

  it('код восстановления работает один раз, повтор и чужой хеш — нет', async () => {
    // включаем заново после replay-теста… TOTP уже включён — код восстановления
    // берём из нового включения, чтобы знать открытый текст
    const secret = generateTotpSecret()
    const codes = await enableTotp({ id: empId, name: 'DF09 тест', roles: ['manager'] }, secret, currentCode(secret))
    const before = await db.totpRecoveryCode.count({ where: { employeeId: empId, usedAt: null } })

    const used = await verifyTotpSecondStep(empId, codes[0])
    expect(used.ok).toBe(true)
    if (used.ok) expect(used.usedRecovery).toBe(true)

    const after = await db.totpRecoveryCode.count({ where: { employeeId: empId, usedAt: null } })
    expect(after).toBe(before - 1)

    const replay = await verifyTotpSecondStep(empId, codes[0])
    expect(replay.ok).toBe(false)

    // нормализация: тот же код с дефисом и в нижнем регистре — это УЖЕ
    // использованный код (проверяем, что дубликат по хешу не пролез)
    const again = await verifyTotpSecondStep(empId, codes[0].toLowerCase())
    expect(again.ok).toBe(false)

    // «IIII-IIII» не может быть сгенерирован (в алфавите генерации нет
    // I, L, O, 0, 1) — заведомо чужой код, детерминированно
    const junk = await verifyTotpSecondStep(empId, 'IIII-IIII')
    expect(junk.ok).toBe(false)
    const short = await verifyTotpSecondStep(empId, '12345')
    expect(short.ok).toBe(false)
  })

  it('выключение стирает секрет и коды, пишет событие totp_disabled', async () => {
    await disableTotp({ id: empId, name: 'DF09 тест', roles: ['manager'] })
    const row = await db.employee.findUnique({ where: { id: empId } })
    expect(row?.totpSecret).toBeNull()
    expect(row?.totpEnabledAt).toBeNull()
    expect(row?.totpLastStep).toBeNull()
    expect(await db.totpRecoveryCode.count({ where: { employeeId: empId } })).toBe(0)
    const ev = await db.activity.findFirst({
      where: { type: 'totp_disabled', actorId: empId },
    })
    expect(ev).not.toBeNull()
  })
})

describe('df-09: выйти на всех устройствах', () => {
  it('удаляет все сессии пользователя, включая текущую', async () => {
    await db.employeeSession.createMany({
      data: [
        { employeeId: empId, token: `tok-${RUN}-1`, expiresAt: new Date(Date.now() + 60_000) },
        { employeeId: empId, token: `tok-${RUN}-2`, expiresAt: new Date(Date.now() + 60_000) },
        { employeeId: empId, token: `tok-${RUN}-old`, expiresAt: new Date(Date.now() - 60_000) },
      ],
    })
    const revoked = await revokeAllSessions(empId)
    expect(revoked).toBe(3)
    expect(await db.employeeSession.count({ where: { employeeId: empId } })).toBe(0)
  })
})

describe('df-09: шифрование (AES-256-GCM)', () => {
  it('round-trip и отказ на чужом AAD/порче тега', () => {
    const blob = encryptTotpSecret('ABC23456ABC23456', 'emp-1')
    expect(decryptTotpSecret(blob, 'emp-1')).toBe('ABC23456ABC23456')
    expect(() => decryptTotpSecret(blob, 'emp-2')).toThrow()
    const parts = blob.split(':')
    parts[3] = parts[3].slice(0, -2) + (parts[3].endsWith('AA') ? 'BB' : 'AA')
    expect(() => decryptTotpSecret(parts.join(':'), 'emp-1')).toThrow()
  })

  it('разные шифротексты при одинаковых данных (случайный IV)', () => {
    expect(encryptTotpSecret('X', 'a')).not.toBe(encryptTotpSecret('X', 'a'))
  })
})
