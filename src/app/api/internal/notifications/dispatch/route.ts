import { NextRequest, NextResponse } from 'next/server'
import { dispatchNow } from '@/lib/notifications/dispatch'

// POST /api/internal/notifications/dispatch — ход диспетчера уведомлений.
// Карточка DF-03: «время рассылок не зашивается в расписание: внешний
// вызов происходит каждые ~15 минут, а сам эндпоинт по настройкам
// решает, что пора (окна дайджестов, повторы, красные…)».
//
// Источник вызовов: workflow GitHub Actions по расписанию (каждые
// 5 минут — .github/workflows/scheduler.yml) плюс суточный Vercel Cron
// как подстраховка (шаги владельца — RELEASE-INSTRUCTIONS). Окно
// считается выполненным при вызове в течение 15 минут после начала
// (windows.ts) — задержки планировщика допустимы по карточке.
//
// Защита: Authorization: Bearer ${CRON_SECRET} (env, D32 — секрет
// инфраструктуры в переменных окружения, не в настройках). CRON_SECRET
// не задан — эндпоинт выключен (403): маршрут только для машины, не
// для людей (IC-02: у каждого роута есть guard аутентификации).
export async function POST(req: NextRequest) {
  const secret = (process.env.CRON_SECRET ?? '').trim()
  const auth = req.headers.get('authorization') ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
  if (!secret || token !== secret) {
    return NextResponse.json({ error: 'Недостаточно прав' }, { status: 403 })
  }
  try {
    const run = await dispatchNow()
    return NextResponse.json(run)
  } catch (e) {
    console.error('[notifications/dispatch] проход не удался:', e)
    return NextResponse.json({ error: 'Не удалось выполнить проход диспетчера' }, { status: 500 })
  }
}
