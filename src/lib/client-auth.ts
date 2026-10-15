import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { db } from './db'

// ─── Auth-механизм клиентского кабинета (И1, роадмап раздел 1) ─────
// Своя сессия на тип внешнего пользователя (А5/Г4: ClientSession, не
// роль в общей таблице сотрудников). Отличия от requireEmployee (А4)
// и requireContractor (Г4) — осознанные, не «забытые»:
//   • НЕТ ролей и write-флага — у клиента ровно одно право: читать
//     свои запросы и заявки, создавать новые запросы;
//   • isActive ПРОВЕРЯЕТСЯ (в отличие от подрядчика): у Customer
//     isActive=false означает «больше не работаем» — бывшему клиенту
//     кабинет не нужен, вход закрывается и живые сессии гаснут.
//     (У подрядчика isActive — «исключён из пула», мягкое; у клиента
//     такой двойной semantics нет — деактивирован = доступ закрыт.)
//   • password nullable: доступ выдаётся опционально — у клиента без
//     пароля вход невозможен в принципе (login выдаёт 401, не раскрывая,
//     выдан ли доступ; см. роут входа).
export const CLIENT_SESSION_COOKIE = 'logix_client_session'
const SESSION_DAYS = 30

export type CurrentClient = {
  id: string
  name: string
  phone: string | null
  email: string | null
}

export async function getClientByToken(token: string | undefined): Promise<CurrentClient | null> {
  if (!token) return null

  const session = await db.clientSession.findUnique({
    where: { token },
    include: { customer: true },
  })
  if (!session || session.expiresAt < new Date()) return null
  // Деактивированный клиент = доступ закрыт (см. шапку файла) —
  // проверка живая, на каждый запрос: откат isActive у живой сессии
  // закрывает кабинет немедленно (паттерн живого lookup ролей Ж6в).
  if (!session.customer.isActive) return null

  return {
    id: session.customer.id,
    name: session.customer.name,
    phone: session.customer.phone,
    email: session.customer.email,
  }
}

export async function getCurrentClient(req: NextRequest): Promise<CurrentClient | null> {
  return getClientByToken(req.cookies.get(CLIENT_SESSION_COOKIE)?.value)
}

type RequireResult =
  | { ok: true; client: CurrentClient }
  | { ok: false; response: NextResponse }

// Единственный способ проверить клиента в роутах кабинета. Без
// опций — см. шапку файла: периметр один («своё и только чтение,
// плюс создание запросов»), формат вызова один, случайно «забыть»
// защиту нельзя.
export async function requireClient(req: NextRequest): Promise<RequireResult> {
  const client = await getCurrentClient(req)

  if (!client) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Не авторизован' }, { status: 401 }),
    }
  }

  return { ok: true, client }
}

export async function createClientSession(customerId: string): Promise<string> {
  const token = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000)
  await db.clientSession.create({ data: { customerId, token, expiresAt } })
  return token
}

export function clientSessionCookieOptions() {
  return {
    name: CLIENT_SESSION_COOKIE,
    maxAge: SESSION_DAYS * 24 * 60 * 60,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
  }
}

export async function destroyClientSession(token: string): Promise<void> {
  await db.clientSession.deleteMany({ where: { token } })
}
