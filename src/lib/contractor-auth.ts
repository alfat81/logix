import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { db } from './db'

// ─── Auth-механизм урезанного ЛК подрядчика (Г4, роадмап раздел 1) ──
// Своя сессия на тип внешнего пользователя (А5: ContractorSession, не
// роль в общей таблице сотрудников). Отличия от requireEmployee (А4)
// осознательные, не «забытые»:
//   • НЕТ ролей — у подрядчика ровно одно право: свои этапы;
//   • НЕТ write-флага — разделять чтение/запись ему нечем: «писать»
//     можно только собственный этап (проверка принадлежительности в
//     роуте stages), читать — только свои заявки;
//   • isActive НЕ проверяется ни здесь, ни в логине: isActive=false —
//     это исключение из ПУЛА (не назначается на новые этапы — Г3
//     отклоняет назначение), а не блокировка аккаунта: «вход в ЛК и
//     существующие этапы живут» (мягкое исключение, шапка Дорожки Г).
//     Полноценной «заморозки» подрядчика в MVP нет — появится, когда
//     понадобится, отдельным флагом, а не перегрузкой смысла isActive.

export const CONTRACTOR_SESSION_COOKIE = 'logix_contractor_session'
const SESSION_DAYS = 30

export type CurrentContractor = {
  id: string
  companyName: string
  phone: string
  isActive: boolean
}

export async function getContractorByToken(
  token: string | undefined
): Promise<CurrentContractor | null> {
  if (!token) return null

  const session = await db.contractorSession.findUnique({
    where: { token },
    include: { contractor: true },
  })
  if (!session || session.expiresAt < new Date()) return null
  // isActive сознательно НЕ проверяется — см. комментарий блока.

  return {
    id: session.contractor.id,
    companyName: session.contractor.companyName,
    phone: session.contractor.phone,
    isActive: session.contractor.isActive,
  }
}

export async function getCurrentContractor(req: NextRequest): Promise<CurrentContractor | null> {
  return getContractorByToken(req.cookies.get(CONTRACTOR_SESSION_COOKIE)?.value)
}

type RequireResult =
  | { ok: true; contractor: CurrentContractor }
  | { ok: false; response: NextResponse }

// Единственный способ проверить подрядчика в роутах портала. Без
// опций — см. обоснование в шапке файла: одно право, один формат
// вызова, случайно «забыть» защиту нельзя.
export async function requireContractor(req: NextRequest): Promise<RequireResult> {
  const contractor = await getCurrentContractor(req)

  if (!contractor) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Не авторизован' }, { status: 401 }),
    }
  }

  return { ok: true, contractor }
}

export async function createContractorSession(contractorId: string): Promise<string> {
  const token = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000)
  await db.contractorSession.create({ data: { contractorId, token, expiresAt } })
  return token
}

export function contractorSessionCookieOptions() {
  return {
    name: CONTRACTOR_SESSION_COOKIE,
    maxAge: SESSION_DAYS * 24 * 60 * 60,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
  }
}

export async function destroyContractorSession(token: string): Promise<void> {
  await db.contractorSession.deleteMany({ where: { token } })
}
