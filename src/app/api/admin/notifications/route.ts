import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireEmployee } from '@/lib/auth'
import { apiErrorResponse } from '@/lib/api-errors'

// GET /api/admin/notifications — журнал очереди писем (только мастер).
// Карточка DF-03: «мастеру доступен GET /api/admin/notifications?...
// для проверки тел писем в e2e (в CI EMAIL_PROVIDER=fake)». Полноценный
// экран журнала и кнопка «Повторить» — DF-04 (следующий релиз), здесь
// — машиночитаемый срез очереди для e2e и диагностики.
//
// Фильтры: status (pending|sent|failed|skipped), recipientKind
// (employee|client|broker), mode (immediate|regular|red), take ≤ 200.
// Тела писем возвращаются целиком: мастер — привилегированная роль
// (RULES 2.4 про маскирование относится к логам/Sentry, журнал —
// рабочий инструмент мастера; маскирование в UI-списке сделает DF-04).
//
// DF-04: counts — распределение найденного (с теми же фильтрами,
// КРОМЕ status) по статусам — табы ListTabs на экране журнала
// (BRANDBOOK §4.2: «число — распределение найденного по тому же
// поиску»).
export async function GET(req: NextRequest) {
  const auth = await requireEmployee(req, { roles: ['master'] })
  if (!auth.ok) return auth.response

  try {
    const url = new URL(req.url)
    const status = url.searchParams.get('status')
    const recipientKind = url.searchParams.get('recipientKind')
    const mode = url.searchParams.get('mode')
    const takeRaw = Number.parseInt(url.searchParams.get('take') ?? '50', 10)
    const take = Number.isFinite(takeRaw) ? Math.min(Math.max(takeRaw, 1), 200) : 50

    const notifications = await db.notification.findMany({
      where: {
        ...(status ? { status } : {}),
        ...(recipientKind ? { recipientKind } : {}),
        ...(mode ? { mode } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take,
      select: {
        id: true,
        recipientKind: true,
        recipientId: true,
        toAddress: true,
        channel: true,
        mode: true,
        eventId: true,
        type: true,
        subject: true,
        body: true,
        status: true,
        attempts: true,
        nextAttemptAt: true,
        sentAt: true,
        lastError: true,
        providerId: true,
        windowKey: true,
        createdAt: true,
      },
    })
    // Табы журнала: числа — по тем же фильтрам получателя/режима,
    // но без фильтра статуса (активный таб не сужает сам себя).
    const groups = await db.notification.groupBy({
      by: ['status'],
      where: {
        ...(recipientKind ? { recipientKind } : {}),
        ...(mode ? { mode } : {}),
      },
      _count: { _all: true },
    })
    const counts: Record<string, number> = { pending: 0, sent: 0, failed: 0, skipped: 0 }
    for (const g of groups) counts[g.status] = g._count._all
    return NextResponse.json({ notifications, counts })
  } catch (e) {
    return apiErrorResponse(e, 'notifications GET', 'Не удалось загрузить очередь уведомлений')
  }
}
