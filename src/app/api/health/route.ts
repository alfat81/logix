import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// E0-10: проверка живости для мониторинга (UptimeRobot и т.п.).
// Без авторизации и без данных: только «жива ли БД» и версия сборки.
export const dynamic = 'force-dynamic'

export async function GET() {
  const version = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'local'
  const started = Date.now()
  try {
    await db.$queryRaw`SELECT 1`
    return NextResponse.json(
      { status: 'ok', db: 'ok', dbMs: Date.now() - started, version },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  } catch (e) {
    console.error('[health] db check failed:', e)
    return NextResponse.json(
      { status: 'error', db: 'error', version },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    )
  }
}
