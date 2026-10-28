import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { db } from '../db'
import { retryNotification } from './retry'

// ─── DF-04: повтор отправки из журнала (интеграция, реальная БД) ─────
// Карточка DF-04: «повтор переводит в pending», повтор разрешён только
// для failed/skipped. HTTP-слой (права мастера, 404/409) покрывает
// e2e-секция DF-04; здесь — семантика lib-функции против PostgreSQL.

const RUN = Date.now() % 1e8
const MARK = 'df04rt-' + RUN

let failedId = ''
let skippedId = ''
let sentId = ''
let pendingId = ''

async function seed(status: string, extra: Record<string, unknown> = {}): Promise<string> {
  const row = await db.notification.create({
    data: {
      recipientKind: 'employee',
      toAddress: `${MARK}-${status}@test.example`,
      channel: 'email',
      mode: 'red',
      type: 'order_stage_problem',
      subject: `DF-04 retry ${status}`,
      body: 'Письмо-фикстура retry-теста.',
      status,
      dedupKey: `${MARK}-${status}`,
      ...extra,
    },
  })
  return row.id
}

beforeAll(async () => {
  failedId = await seed('failed', { attempts: 5, lastError: 'resend 502: fixture' })
  skippedId = await seed('skipped', { lastError: 'not_configured' })
  sentId = await seed('sent', { sentAt: new Date(), providerId: 'fake:retry-test' })
  pendingId = await seed('pending', { nextAttemptAt: new Date(Date.now() + 60_000) })
})

afterAll(async () => {
  await db.notification.deleteMany({ where: { dedupKey: { startsWith: MARK } } })
})

describe('DF-04 retryNotification: failed/skipped → pending', () => {
  it('failed → pending, attempts сброшен, nextAttemptAt очищен', async () => {
    expect(await retryNotification(failedId)).toEqual({ ok: true })
    const row = await db.notification.findUniqueOrThrow({ where: { id: failedId } })
    expect(row.status).toBe('pending')
    expect(row.attempts).toBe(0)
    expect(row.nextAttemptAt).toBeNull()
    // lastError сохраняется до следующей попытки — контекст «почему повторили»
    expect(row.lastError).toBe('resend 502: fixture')
  })

  it('skipped → pending (канал включили / allowlist сменился)', async () => {
    expect(await retryNotification(skippedId)).toEqual({ ok: true })
    const row = await db.notification.findUniqueOrThrow({ where: { id: skippedId } })
    expect(row.status).toBe('pending')
  })

  it('sent → not_retryable, строка не изменилась (без дублей)', async () => {
    expect(await retryNotification(sentId)).toEqual({ ok: false, code: 'not_retryable' })
    const row = await db.notification.findUniqueOrThrow({ where: { id: sentId } })
    expect(row.status).toBe('sent')
    expect(row.sentAt).not.toBeNull()
  })

  it('pending → not_retryable (ещё не отправлялся — повтор не нужен)', async () => {
    expect(await retryNotification(pendingId)).toEqual({ ok: false, code: 'not_retryable' })
    const row = await db.notification.findUniqueOrThrow({ where: { id: pendingId } })
    expect(row.status).toBe('pending')
  })

  it('несуществующий id → not_found', async () => {
    expect(await retryNotification('df04-retry-missing-' + RUN)).toEqual({
      ok: false,
      code: 'not_found',
    })
  })
})
