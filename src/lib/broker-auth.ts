import { NextRequest, NextResponse } from 'next/server'
import type { Broker } from '@prisma/client'
import { db } from './db'
import { definePortal } from './portal-auth'

// Кабинет брокера (Д). Механизм сессий — lib/portal-auth.ts.
// isActive проверяется на каждый запрос: деактивированный брокер
// больше не видит сделки. Права: свои сделки и своя оценка платежей.
export const BROKER_SESSION_COOKIE = 'logix_broker_session'

export type CurrentBroker = { id: string; companyName: string; phone: string }

const portal = definePortal<Broker, CurrentBroker>({
  cookie: BROKER_SESSION_COOKIE,
  store: {
    find: (token) => db.brokerSession.findUnique({ where: { token }, include: { broker: true } })
      .then((s) => (s ? { expiresAt: s.expiresAt, user: s.broker } : null)),
    create: (brokerId, token, expiresAt) => db.brokerSession.create({ data: { brokerId, token, expiresAt } }),
    remove: (token) => db.brokerSession.deleteMany({ where: { token } }),
    purgeExpired: (brokerId, now) => db.brokerSession.deleteMany({ where: { brokerId, expiresAt: { lt: now } } }),
  },
  isAllowed: (u) => u.isActive,
  toCurrent: (u): CurrentBroker => ({ id: u.id, companyName: u.companyName, phone: u.phone }),
})

export const getBrokerByToken = portal.getByToken
export const getCurrentBroker = portal.getCurrent
export const createBrokerSession = portal.createSession
export const destroyBrokerSession = portal.destroySession
export const brokerSessionCookieOptions = portal.cookieOptions

// Единственный способ проверить брокера в роутах кабинета; опций нет —
// периметр один, «забыть» защиту нельзя.
export async function requireBroker(
  req: NextRequest
): Promise<{ ok: true; broker: CurrentBroker } | { ok: false; response: NextResponse }> {
  const r = await portal.require(req)
  return r.ok ? { ok: true, broker: r.user } : r
}
