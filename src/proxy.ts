import { NextRequest, NextResponse } from 'next/server'

// Защита от CSRF (E0-09): изменяющие запросы к API принимаются только
// со своего origin. SameSite=Lax у cookie остаётся первым барьером,
// это — второй. Запросы без Origin (curl, серверные скрипты) не
// трогаем: cookie браузер в них не подставит без нашей страницы.
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

export function proxy(req: NextRequest) {
  if (!MUTATING.has(req.method)) return NextResponse.next()

  const origin = req.headers.get('origin')
  if (!origin) return NextResponse.next()

  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host')
  let originHost: string
  try {
    originHost = new URL(origin).host
  } catch {
    originHost = ''
  }
  if (originHost && host && originHost === host) return NextResponse.next()

  return NextResponse.json({ error: 'Запрос с чужого сайта отклонён' }, { status: 403 })
}

export const config = {
  matcher: '/api/:path*',
}
