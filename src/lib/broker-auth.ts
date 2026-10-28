import { NextRequest, NextResponse } from 'next/server'
import type { Broker, BrokerUser } from '@prisma/client'
import { db } from './db'
import { definePortal } from './portal-auth'

// Кабинет брокера (Д). Механизм сессий — lib/portal-auth.ts.
// DF-02A: сессия принадлежит ЧЕЛОВЕКУ — пользователю брокерской
// компании (BrokerUser), зеркально клиентскому кабинету (И1).
// isActive проверяется на каждый запрос на ДВУХ уровнях: человек и
// компания. Сессии без пользователя (userId null, окно деплоя)
// считаются не найденными — вход заново.
// Права: свои сделки и своя оценка платежей.
export const BROKER_SESSION_COOKIE = 'logix_broker_session'

// id — КОМПАНИЯ (brokerId): скоупинг кабинетских роутов не меняется.
// userId/userName — человек: актёр событий и автор версий документов
// (Блок 4: actorId = userId, проекция имени — lib/actor-name.ts),
// шапка портала и /me.
export type CurrentBroker = {
  id: string
  userId: string
  userName: string
  companyName: string
  phone: string | null
}

type SessionUser = BrokerUser & { broker: Broker }

const portal = definePortal<SessionUser, CurrentBroker>({
  cookie: BROKER_SESSION_COOKIE,
  store: {
    // Сессии без пользователя (userId null — окно деплоя) = не найдена.
    find: (token) =>
      db.brokerSession
        .findUnique({ where: { token }, include: { user: { include: { broker: true } } } })
        .then((s) => (s && s.user ? { expiresAt: s.expiresAt, user: s.user } : null)),
    // Референс = id ПОЛЬЗОВАТЕЛЯ; brokerId берём самим (один
    // findUnique на вход — контракт portal-auth не меняем, там
    // замороженный подрядчик D31).
    create: (brokerUserId, token, expiresAt) =>
      db.brokerUser
        .findUnique({ where: { id: brokerUserId }, select: { brokerId: true } })
        .then((u) => {
          if (!u) throw new Error(`brokerSession.create: пользователь ${brokerUserId} не найден`)
          return db.brokerSession.create({
            data: { brokerId: u.brokerId, userId: brokerUserId, token, expiresAt },
          })
        }),
    remove: (token) => db.brokerSession.deleteMany({ where: { token } }),
    // Просроченные сессии чистим только у ЭТОГО пользователя.
    purgeExpired: (brokerUserId, now) =>
      db.brokerSession.deleteMany({ where: { userId: brokerUserId, expiresAt: { lt: now } } }),
  },
  isAllowed: (u) => u.isActive && u.broker.isActive,
  toCurrent: (u): CurrentBroker => ({
    id: u.brokerId,
    userId: u.id,
    userName: u.name,
    companyName: u.broker.companyName,
    phone: u.phone,
  }),
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
