import { NextRequest, NextResponse } from 'next/server'
import type { Contractor } from '@prisma/client'
import { db } from './db'
import { definePortal } from './portal-auth'

// Кабинет подрядчика (Г4). Механизм сессий — lib/portal-auth.ts.
// isActive НЕ проверяется: false — исключение из пула (не назначается
// на новые этапы), а не блокировка: вход и существующие этапы живут.
export const CONTRACTOR_SESSION_COOKIE = 'logix_contractor_session'

export type CurrentContractor = { id: string; companyName: string; phone: string; isActive: boolean }

const portal = definePortal<Contractor, CurrentContractor>({
  cookie: CONTRACTOR_SESSION_COOKIE,
  store: {
    find: (token) => db.contractorSession.findUnique({ where: { token }, include: { contractor: true } })
      .then((s) => (s ? { expiresAt: s.expiresAt, user: s.contractor } : null)),
    create: (contractorId, token, expiresAt) => db.contractorSession.create({ data: { contractorId, token, expiresAt } }),
    remove: (token) => db.contractorSession.deleteMany({ where: { token } }),
    purgeExpired: (contractorId, now) => db.contractorSession.deleteMany({ where: { contractorId, expiresAt: { lt: now } } }),
  },
  isAllowed: () => true,
  toCurrent: (u): CurrentContractor => ({ id: u.id, companyName: u.companyName, phone: u.phone, isActive: u.isActive }),
})

export const getContractorByToken = portal.getByToken
export const getCurrentContractor = portal.getCurrent
export const createContractorSession = portal.createSession
export const destroyContractorSession = portal.destroySession
export const contractorSessionCookieOptions = portal.cookieOptions

// Единственный способ проверить подрядчика в роутах кабинета; опций нет —
// периметр один, «забыть» защиту нельзя.
export async function requireContractor(
  req: NextRequest
): Promise<{ ok: true; contractor: CurrentContractor } | { ok: false; response: NextResponse }> {
  const r = await portal.require(req)
  return r.ok ? { ok: true, contractor: r.user } : r
}
