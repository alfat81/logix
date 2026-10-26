import { NextRequest, NextResponse } from 'next/server'
import type { Employee } from '@prisma/client'
import { db } from './db'
import { definePortal } from './portal-auth'

// Кабинет сотрудника (А4/А5). Механизм сессий — lib/portal-auth.ts.
// Правило с первого дня: каждый write-роут явно
// передаёт { write: true } и, где уместно, { roles: [...] }. Сейчас
// write ничего не блокирует (read-only ролей нет) — это маркер для
// аудита: `rg "requireEmployee\(req\)"` находит роуты без опций.
// Появится read-only роль — её блокировка на write добавляется здесь.

export const SESSION_COOKIE = 'logix_employee_session'

// Роли — JSON-массив в Employee.roles (не enum БД): новая роль — правка
// этой строки и расстановка в `roles: [...]`.
export type EmployeeRole = 'master' | 'manager'

export type CurrentEmployee = { id: string; name: string; roles: EmployeeRole[] }

function parseRoles(raw: string): EmployeeRole[] {
  try {
    return JSON.parse(raw)
  } catch {
    return []
  }
}

const portal = definePortal<Employee, CurrentEmployee>({
  cookie: SESSION_COOKIE,
  store: {
    find: (token) => db.employeeSession.findUnique({ where: { token }, include: { employee: true } })
      .then((s) => (s ? { expiresAt: s.expiresAt, user: s.employee } : null)),
    create: (employeeId, token, expiresAt) => db.employeeSession.create({ data: { employeeId, token, expiresAt } }),
    remove: (token) => db.employeeSession.deleteMany({ where: { token } }),
    purgeExpired: (employeeId, now) => db.employeeSession.deleteMany({ where: { employeeId, expiresAt: { lt: now } } }),
  },
  // Деактивация и смена ролей применяются к живым сессиям сразу.
  isAllowed: (u) => u.isActive,
  toCurrent: (u) => ({ id: u.id, name: u.name, roles: parseRoles(u.roles) }),
})

export const getEmployeeByToken = portal.getByToken
export const getCurrentEmployee = portal.getCurrent
export const createEmployeeSession = portal.createSession
export const destroySession = portal.destroySession
export const sessionCookieOptions = portal.cookieOptions

type RequireOptions = { roles?: EmployeeRole[]; write?: boolean }

export async function requireEmployee(
  req: NextRequest,
  options: RequireOptions = {}
): Promise<{ ok: true; employee: CurrentEmployee } | { ok: false; response: NextResponse }> {
  const r = await portal.require(req)
  if (!r.ok) return r
  if (options.roles && !r.user.roles.some((role) => options.roles!.includes(role))) {
    return { ok: false, response: NextResponse.json({ error: 'Недостаточно прав' }, { status: 403 }) }
  }
  return { ok: true, employee: r.user }
}
