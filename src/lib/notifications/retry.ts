import { db } from '@/lib/db'

// ─── DF-04: повтор отправки письма из журнала (мастер) ───────────────
// Карточка DF-04: «кнопка "Повторить" для failed/skipped», e2e-проверка
// «повтор переводит в pending». Логика — в lib (интеграционный тест
// retry.test.ts гоняет её против реальной БД без HTTP-слоя), роут
// только оборачивает её в права и статусы.
//
// Семантика повтора (расширение AUD-05, поток A волна 2 — план ред. 3
// §5.5 п. 4):
//   • failed   — терминальный статус после пяти попыток диспетчера
//     (backoff 1/5/30 мин/2 ч/12 ч) ИЛИ зависшая 'sending' с
//     attempts ≥ 4 (stuck_sending): повтор начинает цикл заново;
//   • skipped  — канал не был настроен (not_configured) или адрес не
//     прошёл allowlist в непроизводственном окружении: повтор честная
//     вторая попытка — владелец включил провайдер, окружение сменилось;
//   • sending  — зависшая аренда (сбой процесса после лиза): мастер из
//     журнала DF-04 возвращает строку НЕМЕДЛЕННО, не дожидаясь
//     автовосстановления ≤15 мин. Безопасно при живом отправителе:
//     строка уходит в pending, условный итог «зомби»-отправителя
//     (updateMany WHERE status='sending') отбрасывается — двойная
//     отправка исключена ценой возможной задержки;
//   • pending/sent — повтор запрещён (not_retryable): pending ещё не
//     отправлялся, sent — уже у получателю, дублирование недопустимо
//     (письмо не idempotent-операция).
//
// Сброс attempts в ноль — осознанно: attempts считает попытки ТЕКУЩЕГО
// цикла доставки (backoff-лестница), история прежних попыток остаётся
// в lastError до первой успешной/неуспешной отправки после повтора.
// nextAttemptAt = NULL — строка сразу попадает в claimBatch().

export type RetryOutcome =
  | { ok: true }
  | { ok: false; code: 'not_found' | 'not_retryable' }

export async function retryNotification(id: string): Promise<RetryOutcome> {
  const row = await db.notification.findUnique({
    where: { id },
    select: { status: true },
  })
  if (!row) return { ok: false, code: 'not_found' }
  // AUD-05: sending повторяем — ручной возврат зависшей аренды в очередь
  if (row.status !== 'failed' && row.status !== 'skipped' && row.status !== 'sending') {
    return { ok: false, code: 'not_retryable' }
  }
  await db.notification.update({
    where: { id },
    data: { status: 'pending', attempts: 0, nextAttemptAt: null },
  })
  return { ok: true }
}
