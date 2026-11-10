import { db } from '@/lib/db'
import { getEmailSender } from '@/lib/brand'
import { getTransport } from './channel'
import { NOT_CONFIGURED } from './transport'
import { processRegularDigests } from './digest'
import { processOwnerDigest } from './owner-digest'
import { scanPermitOverdue } from './permits-scan'
import { importCbrRates } from '@/lib/cbr'

// ─── DF-03: диспетчер очереди уведомлений ────────────────────────────
// Карточка DF-03: «выбирает pending с nextAttemptAt <= now через
// SELECT … FOR UPDATE SKIP LOCKED, лимит пачки, пишет итог. Паузы
// повторов: 1 мин, 5 мин, 30 мин, 2 ч, 12 ч; затем failed».
//
// Что уходит пачкой: immediate/red с наступившим nextAttemptAt и
// готовые дайджесты (type=digest). Накопленные regular-строки
// (nextAttemptAt = NULL) пачкой не отправляются — их собирает
// processRegularDigests() в окнах.
//
// Гонки двух диспетчеров (AUD-05, поток A волна 2 — план ред. 3 §5.5):
// короткая транзакция ЗАЯВКИ (ids, SKIP LOCKED, commit) + ЛИЗ-ЗАХВАТ
// перед отправкой: updateMany pending→'sending' с nextAttemptAt =
// сейчас + 15 мин (срок аренды). count!==1 — строку забрал параллельный
// диспетчер → skipped. ВСЕ итоговые записи — условно от статуса
// 'sending' (updateMany WHERE status='sending'): если строку оживил
// recovery-проход, итог «зомби»-отправителя отбрасывается (дубль
// исключён ценой возможной задержки). Зависшая 'sending' (сбой
// процесса после лиза) восстанавливается в начале пачки: ≤15 мин
// возврат в очередь (attempts+1) либо failed при attempts≥4; мастер
// может вернуть строку немедленно через журнал DF-04 (retry.ts).
// Держать сеть провайдера внутри транзакции с блокировками нельзя
// (§9: «Interactive-транзакции на Neon — явные timeout/maxWait»).
//
// Тестовые окружения (карточка DF-03): вне production (VERCEL_ENV /
// NODE_ENV) письма уходят только адресам из EMAIL_ALLOWLIST, остальные
// — skipped: not_allowlisted. Запись формата: «адрес» — точное
// совпадение, «домен» — любой адрес на домен (нужен e2e со случайными
// фикстурами).

const BACKOFF_MINUTES = [1, 5, 30, 120, 720]
const BATCH_LIMIT = 50
const MAX_BATCHES = 10
// Технический троттлинг немедленной попытки после коммита (после
// каждого write-роута свой вызов scheduleDispatch — без троттлинга
// пачка диспетчера запускается на каждый чих).
const SCHEDULE_THROTTLE_MS = 15_000
// AUD-05: срок аренды 'sending'. Зависшая строка (сбой процесса после
// лиза) видна recovery-проходу не раньше истечения срока — за это
// время честная отправка успевает завершиться; у истёкшей аренды
// зомби-итог отбрасывается условной записью.
const LEASE_MINUTES = 15
// Потолок попыток recovery (план §5.5 п. 3): зависшая sending с
// attempts ≥ 4 терминально failed (лестница повторов исчерпана,
// мастер возвращает строку журналом DF-04), ниже — возврат в очередь
// с честным attempts+1.
const STUCK_FAILED_ATTEMPTS = 4

export type DispatchRun = {
  sent: number
  failed: number
  skipped: number
}

function isProduction(): boolean {
  const vercel = process.env.VERCEL_ENV
  if (vercel) return vercel === 'production'
  return process.env.NODE_ENV === 'production'
}

function allowlisted(address: string): boolean {
  const list = (process.env.EMAIL_ALLOWLIST ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
  if (list.length === 0) return false
  const a = address.trim().toLowerCase()
  return list.some((entry) => (entry.includes('@') ? entry === a : a.endsWith(`@${entry}`)))
}

async function claimBatch(): Promise<string[]> {
  const rows = await db.$transaction(
    async (tx) => {
      return tx.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "Notification"
        WHERE "status" = 'pending'
          AND ("mode" IN ('immediate', 'red') OR "type" = 'digest')
          AND ("nextAttemptAt" IS NULL OR "nextAttemptAt" <= now())
        ORDER BY "createdAt" ASC
        LIMIT ${BATCH_LIMIT}
        FOR UPDATE SKIP LOCKED`
    },
    { timeout: 10_000, maxWait: 5_000 }
  )
  return rows.map((r) => r.id)
}

// AUD-05: автовосстановление зависших 'sending' — начало каждой пачки.
// Восстановленная строка честно считается попыткой (attempts+1).
async function recoverStuckSending(): Promise<void> {
  const now = new Date()
  await db.notification.updateMany({
    where: { status: 'sending', nextAttemptAt: { lte: now }, attempts: { gte: STUCK_FAILED_ATTEMPTS } },
    data: { status: 'failed', lastError: 'stuck_sending' },
  })
  await db.notification.updateMany({
    where: { status: 'sending', nextAttemptAt: { lte: now }, attempts: { lt: STUCK_FAILED_ATTEMPTS } },
    data: { status: 'pending', attempts: { increment: 1 }, lastError: 'stuck_sending_recovered' },
  })
}

async function sendOne(
  id: string,
  sender: { fromName: string; replyTo: string | null }
): Promise<'sent' | 'failed' | 'skipped'> {
  const row = await db.notification.findUnique({ where: { id } })
  // Строка исчезла/уже в лизе параллельного вызова — нейтрально.
  if (!row || row.status !== 'pending') return 'skipped'

  // Лиз-захват (AUD-05): pending→sending ДО сетевой отправки.
  // count!==1 — строку забрал параллельный диспетчер.
  const leased = await db.notification.updateMany({
    where: { id, status: 'pending' },
    data: { status: 'sending', nextAttemptAt: new Date(Date.now() + LEASE_MINUTES * 60_000) },
  })
  if (leased.count !== 1) return 'skipped'

  // Все итоговые записи — условно от 'sending': если строку оживил
  // recovery (истёкшая аренда), итог «зомби»-отправителя отбрасывается
  // (count 0) — дубль исключён, строку уводит заново восстановленный
  // проход.
  const finalize = async (
    data: {
      status: string
      attempts?: number
      nextAttemptAt?: Date | null
      sentAt?: Date
      providerId?: string | null
      lastError?: string | null
    }
  ): Promise<boolean> => {
    const done = await db.notification.updateMany({ where: { id, status: 'sending' }, data })
    return done.count === 1
  }

  const production = isProduction()
  if (!production && !allowlisted(row.toAddress)) {
    await finalize({ status: 'skipped', lastError: 'not_allowlisted' })
    return 'skipped'
  }

  let res: { ok: boolean; providerId?: string; error?: string }
  try {
    const transport = getTransport(row.channel)
    res = await transport.send({
      to: row.toAddress,
      subject: row.subject,
      body: row.body,
      fromName: sender.fromName,
      replyTo: sender.replyTo,
    })
  } catch (e) {
    // Исключение транспорта (сеть и пр.) — как отказ провайдера:
    // условная запись backoff; строку, оживлённую recovery, не трогаем.
    console.error('[dispatch] исключение транспорта', id, e)
    res = { ok: false, error: e instanceof Error ? e.message : 'transport_exception' }
  }

  if (res.ok) {
    const ours = await finalize({
      status: 'sent',
      sentAt: new Date(),
      providerId: res.providerId ?? null,
      lastError: null,
      nextAttemptAt: null,
    })
    return ours ? 'sent' : 'skipped'
  }
  if (res.error === NOT_CONFIGURED) {
    // Канал не настроен — терминально: повтор бессмыслен, пока владелец
    // не включит провайдера (журнал DF-04 даст кнопку «Повторить»).
    await finalize({ status: 'skipped', lastError: NOT_CONFIGURED })
    return 'skipped'
  }
  const attempts = row.attempts + 1
  if (attempts >= BACKOFF_MINUTES.length) {
    const ours = await finalize({
      status: 'failed',
      attempts,
      nextAttemptAt: null,
      lastError: res.error ?? 'unknown',
    })
    return ours ? 'failed' : 'skipped'
  }
  const pauseMin = BACKOFF_MINUTES[attempts - 1]
  const ours = await finalize({
    status: 'pending',
    attempts,
    nextAttemptAt: new Date(Date.now() + pauseMin * 60_000),
    lastError: res.error ?? 'unknown',
  })
  return ours ? 'failed' : 'skipped'
}

// Одна пачка: автовосстановление зависших (AUD-05) → заявка →
// отправка вне транзакции → условный итог.
export async function dispatchPendingBatch(): Promise<DispatchRun> {
  await recoverStuckSending()
  const ids = await claimBatch()
  const result: DispatchRun = { sent: 0, failed: 0, skipped: 0 }
  if (ids.length === 0) return result
  const sender = await getEmailSender()
  for (const id of ids) {
    try {
      const outcome = await sendOne(id, sender)
      result[outcome] += 1
    } catch (e) {
      // Сбой инфраструктуры на одном письме не останавливает пачку;
      // строка остаётся pending — повтор по расписанию.
      console.error('[dispatch] сбой письма', id, e)
      result.failed += 1
    }
  }
  return result
}

// Полный проход: импорт курсов ЦБ (раз в сутки, идемпотентен) + окна
// дайджестов + сводка владельцу (DF-08: свои окна/дедуп, письмо создаётся
// здесь и уходит этой же пачкой — type='digest' забирается claimBatch)
// + пачки до исчерпания (с потолком). Сбой курсов НЕ валит проход
// (lib/cbr.ts гасит ошибку сам — расчёты берут последний курс); сбой
// сводки тоже не должен: обычные письма важнее (cron повторит через 5 мин).
export async function dispatchNow(): Promise<
  DispatchRun & { window: string | null; digests: number; ownerDigests: number; ratesImported: number; ratesDate: string | null; ratesSkipped: boolean; permitOverdue: number }
> {
  // DF-17: курсы ЦБ РФ — проходом диспетчера (карточка): короткое
  // замыкание, если курс за сегодня уже импортирован.
  const rates = await importCbrRates()
  // DF-16: скан просрочки разрешительных — до дайджестов, чтобы красные
  // письма ушли этой же пачкой, а «Ждём от вас» дайджестов видело
  // актуальные строки (событие идемпотентно по lastRemindedAt).
  let permitOverdue = 0
  try {
    permitOverdue = (await scanPermitOverdue()).emitted
  } catch (e) {
    console.error('[dispatch] скан разрешительных не удался (cron повторит):', e)
  }
  const digest = await processRegularDigests()
  let ownerDigests = 0
  try {
    ownerDigests = (await processOwnerDigest()).sent
  } catch (e) {
    console.error('[dispatch] сводка владельцу не удалась (cron повторит):', e)
  }
  const totals: DispatchRun = { sent: 0, failed: 0, skipped: 0 }
  for (let i = 0; i < MAX_BATCHES; i += 1) {
    const batch = await dispatchPendingBatch()
    totals.sent += batch.sent
    totals.failed += batch.failed
    totals.skipped += batch.skipped
    if (batch.sent + batch.failed + batch.skipped === 0) break
  }
  return {
    ...totals,
    window: digest.window,
    digests: digest.digests,
    ownerDigests,
    ratesImported: rates.imported,
    ratesDate: rates.date,
    ratesSkipped: rates.skipped,
    permitOverdue,
  }
}

let scheduleInFlight = false
let scheduleLastStart = 0

// Немедленная попытка диспетчера после коммита write-операции
// (immediate/red ≤ 5 минут, D33). Вызывается из emitEvent ПОСЛЕ
// транзакции; работа — внутри after() (next/server): выполняется после
// завершения ответа, за пределами request-контекста after() бросает —
// вызывающий (events.ts) молча пропускает, внешний cron догонит.
// В тестах (vitest) автоматический диспетчер выключен: очередью и
// повторами управляют сами тесты.
export function scheduleDispatch(): void {
  if (process.env.VITEST) return
  const now = Date.now()
  if (scheduleInFlight || now - scheduleLastStart < SCHEDULE_THROTTLE_MS) return
  scheduleInFlight = true
  scheduleLastStart = now
  void import('next/server')
    .then(({ after }) =>
      after(async () => {
        try {
          await dispatchNow()
        } catch (e) {
          console.error('[dispatch] немедленный проход не удался (cron повторит):', e)
        }
      })
    )
    .catch(() => {
      // нет request-контекста — пропуск (см. шапку)
    })
    .finally(() => {
      scheduleInFlight = false
    })
}
