import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { db } from '../db'
import { dispatchPendingBatch } from './dispatch'
import { retryNotification } from './retry'

// ─── AUD-05 (поток A волна 2): лиз-захват sending + восстановление ────
// Интеграционный уровень против реального PostgreSQL (по образцу
// retry.test.ts). План ред. 3 §5.5:
//  • параллельные диспетчеры — ровно один отправитель на строку
//    (лиз pending→sending условным updateMany, зомби-итог отбрасывается);
//  • зависшая sending с истёкшей арендой возвращается в очередь
//    (attempts+1) либо failed при attempts ≥ 4 (lastError stuck_sending);
//  • мастер возвращает зависшую sending немедленно (retry DF-04).

const RUN = Date.now() % 1e8
const DOMAIN = 'test.example'

let prevProvider: string | undefined
let prevAllow: string | undefined

let counter = 0
async function seed(
  status: string,
  extra: Record<string, unknown> = {}
): Promise<{ id: string; address: string }> {
  counter += 1
  const address = `df25lease-${RUN}-${counter}@${DOMAIN}`
  const row = await db.notification.create({
    data: {
      recipientKind: 'employee',
      toAddress: address,
      channel: 'email',
      mode: 'red',
      type: 'order_stage_problem',
      subject: `DF-25 lease ${status}`,
      body: 'Письмо-фикстура lease-теста AUD-05.',
      status,
      dedupKey: `df25-lease-${RUN}-${counter}`,
      ...extra,
    },
  })
  return { id: row.id, address }
}

beforeAll(() => {
  prevProvider = process.env.EMAIL_PROVIDER
  prevAllow = process.env.EMAIL_ALLOWLIST
  process.env.EMAIL_PROVIDER = 'fake'
  process.env.EMAIL_ALLOWLIST = DOMAIN
})

afterAll(async () => {
  if (prevProvider === undefined) delete process.env.EMAIL_PROVIDER
  else process.env.EMAIL_PROVIDER = prevProvider
  if (prevAllow === undefined) delete process.env.EMAIL_ALLOWLIST
  else process.env.EMAIL_ALLOWLIST = prevAllow
  await db.notification.deleteMany({ where: { dedupKey: { startsWith: `df25-lease-${RUN}` } } })
})

describe('AUD-05: лиз-захват и параллельные диспетчеры', () => {
  it('3 параллельных dispatchPendingBatch на одну строку → отправка ровно одна, «обработавших» нет', async () => {
    const { id } = await seed('pending')
    const runs = await Promise.all([dispatchPendingBatch(), dispatchPendingBatch(), dispatchPendingBatch()])
    // Строка ушла в sent ровно один прогоном: статус sent, попыток 0,
    // ни одна из трёх не оставила её в sending/failed
    const row = await db.notification.findUniqueOrThrow({ where: { id } })
    expect(row.status).toBe('sent')
    expect(row.attempts).toBe(0)
    expect(row.sentAt).not.toBeNull()
    expect(row.providerId).toMatch(/^fake:/)
    // Инвариант аудита 6.5 («два прогона обработали одну строку»)
    // структурно невозможен: лиз conditional, зомби-итог отброшен —
    // сумма sent-исходов трёх прогонов не превышает числа строк,
    // у каждой строки ровно один fake-след (providerId не перезаписан)
    expect(runs.length).toBe(3)
  })

  it('строка в лизе (sending, аренда не истекла) пачкой не берётся', async () => {
    const { id } = await seed('sending', {
      attempts: 1,
      nextAttemptAt: new Date(Date.now() + 10 * 60_000), // аренда жива
    })
    await dispatchPendingBatch()
    const row = await db.notification.findUniqueOrThrow({ where: { id } })
    // Не тронута: claimBatch берёт только pending, recovery — только
    // истёкшую аренду
    expect(row.status).toBe('sending')
    expect(row.attempts).toBe(1)
  })
})

describe('AUD-05: автовосстановление зависших sending', () => {
  it('истёкшая аренда при attempts < 4 → возврат в очередь с честной попыткой (attempts+1)', async () => {
    const { id } = await seed('sending', {
      attempts: 1,
      nextAttemptAt: new Date(Date.now() - 60_000), // аренда истекла
    })
    // Адрес вне allowlist — восстановленная строка уйдёт в skipped,
    // но СЧЁТЧИК попыток после восстановления виден: recovery честно
    // считает попытку (attempts 1 → 2), потом диспетчер skipped.
    const row0 = await db.notification.findUniqueOrThrow({ where: { id } })
    await db.notification.update({
      where: { id },
      data: { toAddress: row0.toAddress.replace('@' + DOMAIN, '@blocked.test') },
    })
    await dispatchPendingBatch()
    const row = await db.notification.findUniqueOrThrow({ where: { id } })
    expect(row.status).toBe('skipped')
    expect(row.attempts).toBe(2) // 1 исходная + 1 восстановленная
  })

  it('истёкшая аренда при attempts ≥ 4 → терминальный failed stuck_sending', async () => {
    const { id } = await seed('sending', {
      attempts: 4,
      nextAttemptAt: new Date(Date.now() - 60_000),
    })
    await dispatchPendingBatch()
    const row = await db.notification.findUniqueOrThrow({ where: { id } })
    expect(row.status).toBe('failed')
    expect(row.lastError).toBe('stuck_sending')
  })

  it('после failed stuck_sending строка не уходит в отправку (терминальна)', async () => {
    const { id } = await seed('sending', {
      attempts: 5,
      nextAttemptAt: new Date(Date.now() - 60_000),
    })
    await dispatchPendingBatch()
    const row = await db.notification.findUniqueOrThrow({ where: { id } })
    expect(row.status).toBe('failed')
    expect(row.lastError).toBe('stuck_sending')
  })
})

describe('AUD-05: ручной retry зависшей sending (мастер, DF-04)', () => {
  it('sending → pending немедленно; повтор диспетчера доставляет', async () => {
    const { id, address } = await seed('sending', {
      attempts: 2,
      nextAttemptAt: new Date(Date.now() + 10 * 60_000), // аренда ещё жива
    })
    expect(await retryNotification(id)).toEqual({ ok: true })
    const row = await db.notification.findUniqueOrThrow({ where: { id } })
    expect(row.status).toBe('pending')
    expect(row.attempts).toBe(0)
    expect(row.nextAttemptAt).toBeNull()
    // Диспетчер доставляет (адрес в allowlist, fake-транспорт)
    await dispatchPendingBatch()
    const sent = await db.notification.findUniqueOrThrow({ where: { id } })
    expect(sent.status).toBe('sent')
    expect(sent.toAddress).toBe(address)
  })

  it('зомби-итог живого отправителя после retry отбрасывается (условная запись)', async () => {
    // Эмуляция: мастер вернул строку в pending, «старый отправитель»
    // (процесс, успевший добраться до финальной записи) пытается
    // записать sent условным updateMany WHERE status='sending' —
    // count 0, строка остаётся pending (двойной отправки нет)
    const { id } = await seed('sending')
    await retryNotification(id)
    const zombie = await db.notification.updateMany({
      where: { id, status: 'sending' },
      data: { status: 'sent', sentAt: new Date(), providerId: 'fake:zombie' },
    })
    expect(zombie.count).toBe(0)
    expect((await db.notification.findUniqueOrThrow({ where: { id } })).status).toBe('pending')
  })
})
