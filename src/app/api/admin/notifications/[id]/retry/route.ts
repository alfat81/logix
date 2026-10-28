import { NextRequest, NextResponse } from 'next/server'
import { requireEmployee } from '@/lib/auth'
import { apiErrorResponse } from '@/lib/api-errors'
import { retryNotification } from '@/lib/notifications/retry'
import { scheduleDispatch } from '@/lib/notifications/dispatch'

// POST /api/admin/notifications/[id]/retry — повтор отправки (DF-04).
// Карточка DF-04: «кнопка "Повторить" для failed/skipped», e2e:
// «повтор переводит в pending». Только мастер (как и весь журнал —
// очередь писем содержит переписку со всеми сторонами сделки).
//
// Семантика — в lib/notifications/retry.ts (интеграционные тесты там):
// failed/skipped → pending с чистым attempts; pending/sent → 409
// (повтор бессмысленен/опасен дублем); неизвестный id → 404.
//
// После постановки в pending — scheduleDispatch(): немедленная попытка
// доставки через after() (троттлинг 15 с, вне VITEST), внешний cron
// (scheduler.yml) догонит как подстраховка. В vitest no-op — очередью
// управляют тесты.
//
// no-event: цель повтора — строка очереди уведомлений, а не сделка
// (eventId у failed/skipped может отсутствовать вовсе); журнал самой
// строки (status/attempts/lastError/sentAt) — и есть след операции.
type Params = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const auth = await requireEmployee(req, { write: true, roles: ['master'] })
  if (!auth.ok) return auth.response

  const { id } = await params
  try {
    const r = await retryNotification(id)
    if (!r.ok) {
      if (r.code === 'not_found') {
        return NextResponse.json({ error: 'Письмо не найдено' }, { status: 404 })
      }
      return NextResponse.json(
        { error: 'Повторить можно только письмо в статусе failed или skipped' },
        { status: 409 }
      )
    }
    scheduleDispatch()
    return NextResponse.json({ ok: true })
  } catch (e) {
    return apiErrorResponse(e, 'notifications retry', 'Не удалось поставить письмо на повтор')
  }
}
