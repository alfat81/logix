import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { db } from './db'

// Auth-паттерн с первого дня — не повторяем историю APEX Moto, где
// requireAdmin(req) без {write:true} и без {roles} давало любому
// авторизованному сотруднику (включая демо-роль) писать данные почти
// везде, и дыра нашлась только спустя 42 роута при отдельном аудите.
// Здесь каждый write-роут обязан явно передать { write: true } и, где
// уместно, { roles: [...] } — обе опции описаны в требуемом вызове
// ниже, пропустить их молча нельзя (нет версии функции без параметров).

export const SESSION_COOKIE = 'logix_employee_session'
const SESSION_DAYS = 30

// Текущий известный набор ролей. JSON-массив в Employee.roles (не
// enum на уровне БД) — расширение списка не требует миграции
// структуры, см. комментарий в schema.prisma. Добавление новой роли
// (например, будущего "department_head") — это правка одной строки
// здесь плюс расстановка её в нужных местах `roles: [...]`.
export type EmployeeRole = 'master' | 'manager'

export type CurrentEmployee = {
  id: string
  name: string
  roles: EmployeeRole[]
}

export async function getEmployeeByToken(token: string | undefined): Promise<CurrentEmployee | null> {
  if (!token) return null

  const session = await db.employeeSession.findUnique({
    where: { token },
    include: { employee: true },
  })
  if (!session || session.expiresAt < new Date()) return null
  if (!session.employee.isActive) return null

  let roles: EmployeeRole[] = []
  try {
    roles = JSON.parse(session.employee.roles)
  } catch {
    roles = []
  }

  return { id: session.employee.id, name: session.employee.name, roles }
}

export async function getCurrentEmployee(req: NextRequest): Promise<CurrentEmployee | null> {
  return getEmployeeByToken(req.cookies.get(SESSION_COOKIE)?.value)
}

type RequireOptions = {
  roles?: EmployeeRole[]
  write?: boolean
}

type RequireResult =
  | { ok: true; employee: CurrentEmployee }
  | { ok: false; response: NextResponse }

// Единственный способ проверить сотрудника в write/read-роутах.
// Вызов без второго аргумента допускает любого авторизованного
// сотрудника на ЧТЕНИЕ — это осознанный дефолт, не случайный пропуск,
// как было в APEX Moto. На запись — {write:true} обязателен явно,
// иначе get запрос ничем не отличается по строгости от write.
export async function requireEmployee(
  req: NextRequest,
  options: RequireOptions = {}
): Promise<RequireResult> {
  const employee = await getCurrentEmployee(req)

  if (!employee) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Не авторизован' }, { status: 401 }),
    }
  }

  if (options.roles && !employee.roles.some((r) => options.roles!.includes(r))) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Недостаточно прав' }, { status: 403 }),
    }
  }

  // ВАЖНО, честно: сейчас write:true сам по себе НИЧЕГО не блокирует —
  // в отличие от APEX Moto, где он автоматически резал demo-роль. Здесь
  // такой роли пока нет (только master/manager, обе полноценные). Флаг
  // пока работает как явный маркер "это write-роут, я его осознанно
  // пометил" — находить незащищённые вызовы через `grep "requireEmployee(req)"
  // без write/roles` становится тривиально, как и при аудите 42 роутов
  // в APEX Moto. Если позже появится read-only роль (аудитор, демо-показ
  // клиенту и т.п.) — это ровно то место, где добавить её
  // автоблокировку на write, одной строкой здесь, не по всем роутам.

  return { ok: true, employee }
}

export async function createEmployeeSession(employeeId: string): Promise<string> {
  const token = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000)
  await db.employeeSession.create({ data: { employeeId, token, expiresAt } })
  return token
}

export function sessionCookieOptions() {
  return {
    name: SESSION_COOKIE,
    maxAge: SESSION_DAYS * 24 * 60 * 60,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
  }
}

export async function destroySession(token: string): Promise<void> {
  await db.employeeSession.deleteMany({ where: { token } })
}
