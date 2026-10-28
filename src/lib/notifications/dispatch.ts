import { db } from '@/lib/db'
import { getEmailSender } from '@/lib/brand'
import { getTransport } from './channel'
import { NOT_CONFIGURED } from './transport'
import { processRegularDigests } from './digest'
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
// Гонки двух диспетчеров: короткая транзакция ЗАЯВКИ (ids, SKIP LOCKED,
// commit) + оптимистичная маркировка (updateMany WHERE status='pending'
// AND attempts=<снимок>): двойная отправка возможна только при
// пересечении двух вызовов в миллисекундах окна отправки — приемлемая
// цена за короткие транзакции на пулере Neon (§9: «Interactive-
// транзакции на Neon — явные timeout/maxWait»; держать сеть провайдера
// внутри транзакции с блокировками нельзя).
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

async function sendOne(
  id: string,
  sender: { fromName: string; replyTo: string | null }
): Promise<'sent' | 'failed' | 'skipped'> {
  const row = await db.notification.findUnique({ where: { id } })
  // Строка исчезла/уже обработана параллельным вызовом — нейтрально.
  if (!row || row.status !== 'pending') return 'skipped'

  const production = isProduction()
  if (!production && !allowlisted(row.toAddress)) {
    await db.notification.update({
      where: { id: row.id },
      data: { status: 'skipped', lastError: 'not_allowlisted' },
    })
    return 'skipped'
  }

  const transport = getTransport(row.channel)
  const res = await transport.send({
    to: row.toAddress,
    subject: row.subject,
    body: row.body,
    fromName: sender.fromName,
    replyTo: sender.replyTo,
  })

  if (res.ok) {
    await db.notification.update({
      where: { id: row.id },
      data: { status: 'sent', sentAt: new Date(), providerId: res.providerId ?? null, lastError: null },
    })
    return 'sent'
  }
  if (res.error === NOT_CONFIGURED) {
    // Канал не настроен — терминально: повтор бессмыслен, пока владелец
    // не включит провайдера (журнал DF-04 даст кнопку «Повторить»).
    await db.notification.update({
      where: { id: row.id },
      data: { status: 'skipped', lastError: NOT_CONFIGURED },
    })
    return 'skipped'
  }
  const attempts = row.attempts + 1
  if (attempts >= BACKOFF_MINUTES.length) {
    await db.notification.update({
      where: { id: row.id },
      data: { status: 'failed', attempts, lastError: res.error ?? 'unknown' },
    })
    return 'failed'
  }
  const pauseMin = BACKOFF_MINUTES[attempts - 1]
  await db.notification.update({
    where: { id: row.id },
    data: {
      attempts,
      nextAttemptAt: new Date(Date.now() + pauseMin * 60_000),
      lastError: res.error ?? 'unknown',
    },
  })
  return 'failed'
}

// Одна пачка: заявка → отправка вне транзакции → итог.
export async function dispatchPendingBatch(): Promise<DispatchRun> {
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
// дайджестов + пачки до исчерпания (с потолком). Сбой курсов НЕ валит
// проход (lib/cbr.ts гасит ошибку сам — расчёты берут последний курс).
export async function dispatchNow(): Promise<
  DispatchRun & { window: string | null; digests: number; ratesImported: number; ratesDate: string | null; ratesSkipped: boolean }
> {
  // DF-17: курсы ЦБ РФ — проходом диспетчера (карточка): короткое
  // замыкание, если курс за сегодня уже импортирован.
  const rates = await importCbrRates()
  const digest = await processRegularDigests()
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
    ratesImported: rates.imported,
    ratesDate: rates.date,
    ratesSkipped: rates.skipped,
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
