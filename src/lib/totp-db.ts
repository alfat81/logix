import { createHash } from 'node:crypto'
import { db } from './db'
import { emitEvent } from './events'
import { generateRecoveryCode, generateTotpSecret, normalizeRecoveryCode, otpauthUri, verifyTotp } from './totp'
import {
  decryptTotpSecret,
  encryptTotpSecret,
  issueTotpChallenge,
} from './totp-crypto'
import { qrSvg } from './qr'
import type { CurrentEmployee } from './auth'

// ─── DF-09: уровень данных двухфакторного входа ──────────────────────
// Запись TOTP-состояния — только здесь (единая точка, инвариант
// «второго механизма сессий нет»): секрет шифруется, коды восстановления
// хранятся хешами, события — emitEvent в той же транзакции (§4.5).
// Включение доступно мастеру и менеджеру (карточка: manager — по
// желанию); право проверяет роут профиля (requireEmployee).

const RECOVERY_CODES_COUNT = 10

function hashRecoveryCode(code: string): string {
  return createHash('sha256').update(normalizeRecoveryCode(code)).digest('hex')
}

export type TotpSetup = { secret: string; otpauthUri: string; qrSvg: string }

/**
 * Свежий секрет для показа в профиле; не сохраняется до подтверждения кодом.
 * account — телефон: ASCII всегда влезает в QR v1–8 (кириллическое имя с
 * encodeURIComponent даёт до 6 символов URI на букву — упирается в 152 байта
 * v8-M, найдено на стенде скриншотов), стабилен и приватнее имени на экране.
 */
export function createTotpSetup(employee: CurrentEmployee, account: string): TotpSetup {
  const secret = generateTotpSecret()
  const uri = otpauthUri({ secret, account })
  return { secret, otpauthUri: uri, qrSvg: qrSvg(uri) }
}

export class TotpCodeMismatchError extends Error {
  // statusCode — контракт apiErrorResponse (честный 4xx вместо 500)
  statusCode = 400
  constructor() {
    super('Код подтверждения неверный')
    this.name = 'TotpCodeMismatchError'
  }
}

/**
 * Включение TOTP: проверка кода из приложения, шифрование секрета
 * (AAD = id), генерация кодов восстановления (наружу — один раз, в
 * БД — только хеши). Событие totp_enabled — в той же транзакции.
 */
export async function enableTotp(
  employee: CurrentEmployee,
  secretB32: string,
  code: string
): Promise<string[]> {
  if (!/^[A-Z2-7]{32,}$/i.test(secretB32.trim())) {
    throw new TotpCodeMismatchError()
  }
  const check = verifyTotp(secretB32.trim(), code)
  if (!check.ok) throw new TotpCodeMismatchError()

  const codes = Array.from({ length: RECOVERY_CODES_COUNT }, generateRecoveryCode)
  await db.$transaction(async (tx) => {
    await tx.employee.update({
      where: { id: employee.id },
      data: {
        totpSecret: encryptTotpSecret(secretB32.trim(), employee.id),
        totpEnabledAt: new Date(),
        totpLastStep: null,
      },
    })
    await tx.totpRecoveryCode.deleteMany({ where: { employeeId: employee.id } })
    await tx.totpRecoveryCode.createMany({
      data: codes.map((c) => ({ employeeId: employee.id, codeHash: hashRecoveryCode(c) })),
    })
    await emitEvent(tx, {
      type: 'totp_enabled',
      actor: { type: 'employee', id: employee.id, name: employee.name },
      description: 'Вход в кабинет теперь требует код из приложения-аутентификатора',
    })
  })
  return codes
}

/** Выключение TOTP: подтверждение паролем, стирание секрета и кодов. */
export async function disableTotp(employee: CurrentEmployee): Promise<void> {
  await db.$transaction(async (tx) => {
    await tx.employee.update({
      where: { id: employee.id },
      data: { totpSecret: null, totpEnabledAt: null, totpLastStep: null },
    })
    await tx.totpRecoveryCode.deleteMany({ where: { employeeId: employee.id } })
    await emitEvent(tx, {
      type: 'totp_disabled',
      actor: { type: 'employee', id: employee.id, name: employee.name },
      description: 'Вход выполняется только по паролю',
    })
  })
}

/** Challenge второго шага после верного пароля (сессия ещё не создана). */
export async function issueLoginChallenge(employeeId: string, phone: string): Promise<string> {
  return issueTotpChallenge({ employeeId, phone })
}

export type TotpSecondStepResult =
  | { ok: true; step: number | null; usedRecovery: boolean }
  | { ok: false }

/**
 * Проверка второго шага: 6 цифр — TOTP (окно ±1, повтор шага ≤
 * totpLastStep отклонён — RFC 6238 §5.2), иначе — код восстановления
 * (одноразовость атомарным updateMany по usedAt: null).
 * TotpNotConfiguredError пробрасывается вверх — роут отвечает 503.
 */
export async function verifyTotpSecondStep(
  employeeId: string,
  code: string
): Promise<TotpSecondStepResult> {
  const employee = await db.employee.findUnique({ where: { id: employeeId } })
  if (!employee || !employee.isActive || !employee.totpEnabledAt || !employee.totpSecret) {
    return { ok: false }
  }
  const secret = decryptTotpSecret(employee.totpSecret, employeeId)

  if (/^\d{6}$/.test(code)) {
    const check = verifyTotp(secret, code, { minStep: employee.totpLastStep ?? undefined })
    if (!check.ok) return { ok: false }
    await db.employee.update({
      where: { id: employeeId },
      data: { totpLastStep: check.step },
    })
    return { ok: true, step: check.step, usedRecovery: false }
  }

  const normalized = normalizeRecoveryCode(code)
  if (normalized.length !== 8) return { ok: false }
  const consumed = await db.totpRecoveryCode.updateMany({
    where: { employeeId, codeHash: hashRecoveryCode(code), usedAt: null },
    data: { usedAt: new Date() },
  })
  if (consumed.count !== 1) return { ok: false }
  return { ok: true, step: null, usedRecovery: true }
}

/** «Выйти на всех устройствах»: все сессии пользователя, включая текущую. */
export async function revokeAllSessions(employeeId: string): Promise<number> {
  const res = await db.employeeSession.deleteMany({ where: { employeeId } })
  return res.count
}
