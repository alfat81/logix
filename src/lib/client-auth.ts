import { NextRequest, NextResponse } from 'next/server'
import type { Customer, CustomerUser } from '@prisma/client'
import { db } from './db'
import { definePortal } from './portal-auth'

// Кабинет клиента (И1). Механизм сессий — lib/portal-auth.ts.
// DF-02A: сессия принадлежит ЧЕЛОВЕКУ — пользователю компании
// (CustomerUser), область видимости по-прежнему компания. isActive
// проверяется на каждый запрос на ДВУХ уровнях: активен ли человек и
// активна ли его компания (деактивация любого из них гасит доступ
// немедленно). Сессии без пользователя (userId null, окно деплоя)
// считаются не найденными — вход заново, это ожидаемо.
// Без пароля вход невозможен (роут входа).
export const CLIENT_SESSION_COOKIE = 'logix_client_session'

// id — КОМПАНИЯ (customerId): скоупинг кабинетских роутов не меняется.
// userId/userName — человек: актёр событий и автор версий документов
// (Блок 4: actorId = userId, проекция имени — lib/actor-name.ts),
// шапка кабинета и /me.
export type CurrentClient = {
  id: string
  userId: string
  userName: string
  name: string
  phone: string | null
  email: string | null
}

type SessionUser = CustomerUser & { customer: Customer }

const portal = definePortal<SessionUser, CurrentClient>({
  cookie: CLIENT_SESSION_COOKIE,
  store: {
    // Сессии без пользователя (userId null — окно деплоя) = не найдена.
    find: (token) =>
      db.clientSession
        .findUnique({ where: { token }, include: { user: { include: { customer: true } } } })
        .then((s) => (s && s.user ? { expiresAt: s.expiresAt, user: s.user } : null)),
    // Референс = id ПОЛЬЗОВАТЕЛЯ (см. createSession). companyId берём
    // самим: один findUnique на вход — вход редкое событие, лишний
    // запрос не стоит изменения контракта portal-auth (замороженный
    // подрядчик D31 сидит на том же definePortal).
    create: (customerUserId, token, expiresAt) =>
      db.customerUser
        .findUnique({ where: { id: customerUserId }, select: { customerId: true } })
        .then((u) => {
          if (!u) throw new Error(`clientSession.create: пользователь ${customerUserId} не найден`)
          return db.clientSession.create({
            data: { customerId: u.customerId, userId: customerUserId, token, expiresAt },
          })
        }),
    remove: (token) => db.clientSession.deleteMany({ where: { token } }),
    // Просроченные сессии чистим только у ЭТОГО пользователя (не
    // компании): коллеги не задеваются.
    purgeExpired: (customerUserId, now) =>
      db.clientSession.deleteMany({ where: { userId: customerUserId, expiresAt: { lt: now } } }),
  },
  isAllowed: (u) => u.isActive && u.customer.isActive,
  toCurrent: (u): CurrentClient => ({
    id: u.customerId,
    userId: u.id,
    userName: u.name,
    name: u.customer.name,
    phone: u.phone,
    email: u.email,
  }),
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
