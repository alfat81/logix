import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { verifyPassword } from '@/lib/password'
import { createEmployeeSession, sessionCookieOptions, type EmployeeRole } from '@/lib/auth'
import { normalizePhone } from '@/lib/phone'
import { checkLoginGuard, recordLoginAttempt } from '@/lib/login-guard'
import { issueLoginChallenge } from '@/lib/totp-db'
import { TotpNotConfiguredError } from '@/lib/totp-crypto'

// POST /api/auth/employee/login
// Body: { phone, password }
// Паттерн входа сотрудника; З2 закрыла
// отложенное в MVP-периметре: проверка перебора теперь стоит до
// сверки пароля (lib/login-guard.ts). DF-09: после верного пароля у
// сотрудника с включённым TOTP сессия НЕ создаётся — роут отдаёт
// { totpRequired, challenge }, код проверяет
// POST /api/auth/employee/login/totp (лимиты guard действуют и там).
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    const phone = normalizePhone(String(body?.phone ?? ''))
    const password = typeof body?.password === 'string' ? body.password : ''

    if (!phone || !password) {
      return NextResponse.json({ error: 'Укажите телефон и пароль' }, { status: 400 })
    }

    // З2: лимиты перебора — ДО обращения к учёткам и сверки пароля.
    // 400 выше не пишется в LoginAttempt: пустое тело — не атака,
    // логина в нём может не быть вовсе
    const guard = await checkLoginGuard(req, phone)
    if (guard) return guard

    const employee = await db.employee.findUnique({ where: { phone } })
    if (!employee) {
      // Формулировка не раскрывает, существует ли телефон — тот же
      // принцип, проверенный ревью логина. Провал пишется
      // в аудит: даже «несуществующий» телефон может быть перебором
      await recordLoginAttempt(req, { kind: 'employee', login: phone, success: false })
      return NextResponse.json({ error: 'Неверный телефон или пароль' }, { status: 401 })
    }
    if (!employee.isActive) {
      // 403 в аудит не пишется: состояние аккаунта, не перебор —
      // пароль на этом пути ещё не сверялся
      return NextResponse.json({ error: 'Аккаунт деактивирован. Обратитесь к мастеру.' }, { status: 403 })
    }

    const ok = verifyPassword(password, employee.password)
    if (!ok) {
      await recordLoginAttempt(req, { kind: 'employee', login: phone, success: false })
      return NextResponse.json({ error: 'Неверный телефон или пароль' }, { status: 401 })
    }

    let roles: EmployeeRole[] = []
    try {
      roles = JSON.parse(employee.roles)
    } catch {
      roles = []
    }
    if (roles.length === 0) {
      return NextResponse.json({ error: 'У аккаунта нет ролей. Обратитесь к мастеру.' }, { status: 403 })
    }

    // DF-09: TOTP включён — второй шаг. Пароль верен, но вход не
    // завершён: успех в аудит и сессия — только после кода (там же
    // провалы неверных кодов идут в лимиты guard'а).
    if (employee.totpEnabledAt) {
      try {
        const challenge = await issueLoginChallenge(employee.id, employee.phone)
        return NextResponse.json({ totpRequired: true, challenge })
      } catch (e) {
        if (e instanceof TotpNotConfiguredError) {
          console.error('[employee/login] TOTP включён, но ключ не настроен')
          return NextResponse.json(
            { error: 'Двухфакторный вход не настроен на сервере. Обратитесь к мастеру.' },
            { status: 503 }
          )
        }
        throw e
      }
    }

    // Пароль сверен — успех в аудит (в лимиты успехи не идут)
    await recordLoginAttempt(req, { kind: 'employee', login: phone, success: true })

    const token = await createEmployeeSession(employee.id)

    const res = NextResponse.json({
      authenticated: true,
      employee: { id: employee.id, name: employee.name, roles },
    })
    res.cookies.set({ ...sessionCookieOptions(), value: token })
    return res
  } catch (e) {
    console.error('[employee/login] error:', e)
    return NextResponse.json({ error: 'Ошибка авторизации' }, { status: 500 })
  }
}
