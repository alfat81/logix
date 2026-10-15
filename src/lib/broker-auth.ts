import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { db } from './db'

// ─── Auth-механизм урезанного ЛК брокера (Д, роадмап раздел 1/5а) ──
// Четвёртый портал (после сотрудника А5, подрядчика Г4 и клиента И1):
// своя сессия и своя кука, не роль в общей таблице сотрудников.
// Отличия от requireContractor (Г4) — осознательные:
//   • isActive ПРОВЕРЯЕТСЯ (в отличие от подрядчика, но как у клиента
//     И1): деактивация брокера = «перестали работать» — внешний
//     участник больше не должен видеть сделки. Проверка живая, на
//     каждый запрос: откат isActive гасит кабинет немедленно.
//   • НЕТ ролей и write-флага — у брокера ровно два права: читать
//     свои сделки (лиды расчёта и заявки целиком) и сообщать свою
//     оценку таможенных платежей (BrokerEstimate). Всё остальное —
//     дело менеджера.
export const BROKER_SESSION_COOKIE = 'logix_broker_session'
const SESSION_DAYS = 30

export type CurrentBroker = {
  id: string
  companyName: string
  phone: string
}

export async function getBrokerByToken(token: string | undefined): Promise<CurrentBroker | null> {
  if (!token) return null

  const session = await db.brokerSession.findUnique({
    where: { token },
    include: { broker: true },
  })
  if (!session || session.expiresAt < new Date()) return null
  // Деактивированный брокер = доступ закрыт (см. шапку файла) —
  // проверка живая, как у клиента (И1), мягкого режима подрядчика
  // (Г4) здесь сознательно нет.
  if (!session.broker.isActive) return null

  return {
    id: session.broker.id,
    companyName: session.broker.companyName,
    phone: session.broker.phone,
  }
}

export async function getCurrentBroker(req: NextRequest): Promise<CurrentBroker | null> {
  return getBrokerByToken(req.cookies.get(BROKER_SESSION_COOKIE)?.value)
}

type RequireResult =
  | { ok: true; broker: CurrentBroker }
  | { ok: false; response: NextResponse }

// Единственный способ проверить брокера в роутах портала. Без
// опций — периметр один («свои сделки + своя оценка»), формат вызова
// один, случайно «забыть» защиту нельзя.
export async function requireBroker(req: NextRequest): Promise<RequireResult> {
  const broker = await getCurrentBroker(req)

  if (!broker) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Не авторизован' }, { status: 401 }),
    }
  }

  return { ok: true, broker }
}

export async function createBrokerSession(brokerId: string): Promise<string> {
  const token = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000)
  await db.brokerSession.create({ data: { brokerId, token, expiresAt } })
  return token
}

export function brokerSessionCookieOptions() {
  return {
    name: BROKER_SESSION_COOKIE,
    maxAge: SESSION_DAYS * 24 * 60 * 60,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
  }
}

export async function destroyBrokerSession(token: string): Promise<void> {
  await db.brokerSession.deleteMany({ where: { token } })
}
