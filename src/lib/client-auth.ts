import { NextRequest, NextResponse } from 'next/server'
import type { Customer } from '@prisma/client'
import { db } from './db'
import { definePortal } from './portal-auth'

// Кабинет клиента (И1). Механизм сессий — lib/portal-auth.ts.
// isActive проверяется на каждый запрос: деактивированный клиент
// теряет доступ немедленно. Без пароля вход невозможен (роут входа).
export const CLIENT_SESSION_COOKIE = 'logix_client_session'

export type CurrentClient = { id: string; name: string; phone: string | null; email: string | null }

const portal = definePortal<Customer, CurrentClient>({
  cookie: CLIENT_SESSION_COOKIE,
  store: {
    find: (token) => db.clientSession.findUnique({ where: { token }, include: { customer: true } })
      .then((s) => (s ? { expiresAt: s.expiresAt, user: s.customer } : null)),
    create: (customerId, token, expiresAt) => db.clientSession.create({ data: { customerId, token, expiresAt } }),
    remove: (token) => db.clientSession.deleteMany({ where: { token } }),
    purgeExpired: (customerId, now) => db.clientSession.deleteMany({ where: { customerId, expiresAt: { lt: now } } }),
  },
  isAllowed: (u) => u.isActive,
  toCurrent: (u): CurrentClient => ({ id: u.id, name: u.name, phone: u.phone, email: u.email }),
})

export const getClientByToken = portal.getByToken
export const getCurrentClient = portal.getCurrent
export const createClientSession = portal.createSession
export const destroyClientSession = portal.destroySession
export const clientSessionCookieOptions = portal.cookieOptions

// Единственный способ проверить клиента в роутах кабинета; опций нет —
// периметр один, «забыть» защиту нельзя.
export async function requireClient(
  req: NextRequest
): Promise<{ ok: true; client: CurrentClient } | { ok: false; response: NextResponse }> {
  const r = await portal.require(req)
  return r.ok ? { ok: true, client: r.user } : r
}
