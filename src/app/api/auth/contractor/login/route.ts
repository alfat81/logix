import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { verifyPassword } from '@/lib/password'
import {
  createContractorSession,
  contractorSessionCookieOptions,
} from '@/lib/contractor-auth'
import { normalizePhone } from '@/lib/phone'
import { apiErrorResponse } from '@/lib/api-errors'
import { checkLoginGuard, recordLoginAttempt } from '@/lib/login-guard'

// POST /api/auth/contractor/login — вход в урезанный ЛК (Г4).
// Body: { phone, password } — логин выдаётся при переводе кандидата
// в пул (Г2), пароль меняет менеджер (Г3); самоподбора/восстановления
// в MVP нет. isActive НЕ блокирует вход: исключённый из пула
// продолжает работать по существующим этапам — блокируется только
// назначение на новое (Г3), см. lib/contractor-auth.ts.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    const phone = normalizePhone(String(body?.phone ?? ''))
    const password = typeof body?.password === 'string' ? body.password : ''

    if (!phone || !password) {
      return NextResponse.json({ error: 'Укажите телефон и пароль' }, { status: 400 })
    }

    // З2: лимиты перебора — ДО обращения к учёткам и сверки пароля
    // (общие с входом сотрудников: перебор одной «двери» запирает обе,
    // см. lib/login-guard.ts). 400 выше в аудит не пишется
    const guard = await checkLoginGuard(req, phone)
    if (guard) return guard

    const contractor = await db.contractor.findUnique({ where: { phone } })
    // Одна формулировка на «нет такого» и «не тот пароль» — не
    // раскрываем перечень логинов подрядчиков (паттерн employee).
    // Провал в обоих случаях пишется в аудит перебора
    if (!contractor || !verifyPassword(password, contractor.password)) {
      await recordLoginAttempt(req, { kind: 'contractor', login: phone, success: false })
      return NextResponse.json({ error: 'Неверный телефон или пароль' }, { status: 401 })
    }

    // Пароль сверен — успех в аудит (в лимиты успехи не идут)
    await recordLoginAttempt(req, { kind: 'contractor', login: phone, success: true })

    const token = await createContractorSession(contractor.id)

    const res = NextResponse.json({
      authenticated: true,
      contractor: {
        id: contractor.id,
        companyName: contractor.companyName,
        phone: contractor.phone,
        isActive: contractor.isActive,
      },
    })
    res.cookies.set({ ...contractorSessionCookieOptions(), value: token })
    return res
  } catch (e) {
    return apiErrorResponse(e, 'contractor/login', 'Ошибка авторизации')
  }
}
