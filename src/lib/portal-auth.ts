import { NextRequest, NextResponse } from 'next/server'
import { createHash, randomBytes } from 'crypto'

// ─── Единый механизм сессий четырёх кабинетов (E0-08, E0-06) ──────────
// Сотрудник, подрядчик, клиент, брокер — у каждого своя таблица сессий
// и своя кука (А5: не роль в общей таблице), но логика одна: токен в
// cookie, срок 30 дней, живая проверка пользователя на каждый запрос.
// Различия кабинетов задаются конфигурацией (isAllowed, toCurrent),
// а не копией кода.
//
// E0-06: в БД хранится только sha256(token), в cookie — сам токен.
// Утечка дампа таблиц сессий не даёт войти: по хешу токен не
// восстановить, а cookie с хешем не совпадёт (мы хешируем ещё раз).
// Старые сессии с «сырым» токеном после деплоя перестают находиться —
// всем пользователям нужно войти заново, это ожидаемо.

const SESSION_DAYS = 30
const SESSION_MS = SESSION_DAYS * 24 * 60 * 60 * 1000

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

type SessionStore<U> = {
  // Поиск по хешу токена; null — сессии нет.
  find(tokenHash: string): Promise<{ expiresAt: Date; user: U } | null>
  create(userId: string, tokenHash: string, expiresAt: Date): Promise<unknown>
  remove(tokenHash: string): Promise<unknown>
  // Удалить просроченные сессии пользователя — вызывается при входе,
  // чтобы таблица не росла без отдельного cron.
  purgeExpired(userId: string, now: Date): Promise<unknown>
}

type PortalConfig<U, C> = {
  cookie: string
  store: SessionStore<U>
  // Пускать ли пользователя с живой сессией (например, isActive).
  isAllowed: (user: U) => boolean
  toCurrent: (user: U) => C
}

export type PortalRequireResult<C> =
  | { ok: true; user: C }
  | { ok: false; response: NextResponse }

export function unauthorized(): NextResponse {
  return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
}

export function definePortal<U, C>(cfg: PortalConfig<U, C>) {
  async function getByToken(token: string | undefined): Promise<C | null> {
    if (!token) return null
    const session = await cfg.store.find(hashSessionToken(token))
    if (!session || session.expiresAt < new Date()) return null
    if (!cfg.isAllowed(session.user)) return null
    return cfg.toCurrent(session.user)
  }

  async function getCurrent(req: NextRequest): Promise<C | null> {
    return getByToken(req.cookies.get(cfg.cookie)?.value)
  }

  async function require(req: NextRequest): Promise<PortalRequireResult<C>> {
    const user = await getCurrent(req)
    return user ? { ok: true, user } : { ok: false, response: unauthorized() }
  }

  async function createSession(userId: string): Promise<string> {
    const token = randomBytes(32).toString('hex')
    const now = new Date()
    await cfg.store.purgeExpired(userId, now)
    await cfg.store.create(userId, hashSessionToken(token), new Date(now.getTime() + SESSION_MS))
    return token
  }

  async function destroySession(token: string): Promise<void> {
    await cfg.store.remove(hashSessionToken(token))
  }

  function cookieOptions() {
    return {
      name: cfg.cookie,
      maxAge: SESSION_MS / 1000,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax' as const,
      path: '/',
    }
  }

  return { cookie: cfg.cookie, getByToken, getCurrent, require, createSession, destroySession, cookieOptions }
}
