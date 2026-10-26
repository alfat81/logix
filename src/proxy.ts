import { NextRequest, NextResponse } from 'next/server'
import { contractorPortalEnabled } from '@/lib/flags'

// Защита от CSRF (E0-09): изменяющие запросы к API принимаются только
// со своего origin. SameSite=Lax у cookie остаётся первым барьером,
// это — второй. Запросы без Origin (curl, серверные скрипты) не
// трогаем: cookie браузер в них не подставит без нашей страницы.
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

// D31 (DF-00C): кабинет подрядчика заморожен. Пока
// CONTRACTOR_PORTAL_ENABLED !== 'true', любые пути кабинета отвечают
// 404 ДО любой логики: ни роуты, ни авторизация, ни cookie подрядчика
// (logix_contractor_session) не обрабатываются. Код кабинета остаётся
// в репо (не удаляется — понадобится при разморозке, docs/FROZEN.md),
// регресс гоняется в CI с включённым флагом.
const CONTRACTOR_PATH = /^\/(api\/(?:auth\/)?contractor(?:\/|$)|contractor(?:\/|$))/

export function proxy(req: NextRequest) {
  if (!contractorPortalEnabled() && CONTRACTOR_PATH.test(req.nextUrl.pathname)) {
    // API — машинный JSON; страницы кабинета — пустой 404 без деталей
    if (req.nextUrl.pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Не найдено' }, { status: 404 })
    }
    return new NextResponse(null, { status: 404 })
  }

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
  // D31: страницы кабинета подрядчика тоже идут через proxy (404 при
  // заморозке); API — дополнительно origin-проверка мутаций (E0-09)
  matcher: ['/api/:path*', '/contractor/:path*'],
}
