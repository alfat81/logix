import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { createEmployeeSession, sessionCookieOptions, type EmployeeRole } from '@/lib/auth'
import { checkLoginGuard, recordLoginAttempt } from '@/lib/login-guard'
import { verifyTotpSecondStep } from '@/lib/totp-db'
import { TotpNotConfiguredError, verifyTotpChallenge } from '@/lib/totp-crypto'

// POST /api/auth/employee/login/totp — второй шаг входа (DF-09).
// Body: { challenge, code } — challenge из ответа первого шага, code —
// 6 цифр из приложения-аутентификатора ИЛИ код восстановления
// «XXXX-XXXX». Исключение из zod-инварианта — то же, что у логина
// (сверка 25.10.2026): вход защищён login-guard'ом, а не схемой тела.
//
// Порядок проверок: подпись и срок challenge (без БД) → лимиты
// перебора по паре «телефон + IP» (тот же бакет, что у первого шага —
// «смена двери не даёт новых попыток») → учётка → код. Неверный код —
// провал в LoginAttempt: перебор второго шага замедляется так же,
// как перебор пароля (критерий приёмки карточки).

const CHALLENGE_INVALID = 'Время на ввод кода истекло — начните вход заново'
const CODE_INVALID = 'Неверный код подтверждения'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    const challenge = typeof body?.challenge === 'string' ? body.challenge : ''
    const code = typeof body?.code === 'string' ? body.code.trim() : ''
    if (!challenge || !code) {
      return NextResponse.json({ error: 'Введите код подтверждения' }, { status: 400 })
    }

    let payload
    try {
      payload = verifyTotpChallenge(challenge)
    } catch (e) {
      if (e instanceof TotpNotConfiguredError) {
        console.error('[employee/login/totp] ключ TOTP не настроен')
        return NextResponse.json(
          { error: 'Двухфакторный вход не настроен на сервере. Обратитесь к мастеру.' },
          { status: 503 }
        )
      }
      throw e
    }
    if (!payload) {
      return NextResponse.json({ error: CHALLENGE_INVALID }, { status: 401 })
    }

    // Тот же ключ guard'а, что у первого шага (телефон из challenge —
    // он подписан сервером, подменить нельзя).
    const guard = await checkLoginGuard(req, payload.phone)
    if (guard) return guard

    const employee = await db.employee.findUnique({ where: { id: payload.employeeId } })
    if (
      !employee ||
      !employee.isActive ||
      employee.phone !== payload.phone ||
      !employee.totpEnabledAt
    ) {
      // Учётка изменилась между шагами (деактивация/выключение TOTP) —
      // challenge больше не действителен.
      return NextResponse.json({ error: CHALLENGE_INVALID }, { status: 401 })
    }

    const result = await verifyTotpSecondStep(employee.id, code)
    if (!result.ok) {
      await recordLoginAttempt(req, { kind: 'employee', login: payload.phone, success: false })
      return NextResponse.json({ error: CODE_INVALID }, { status: 401 })
    }

    let roles: EmployeeRole[] = []
    try {
      roles = JSON.parse(employee.roles)
    } catch {
      roles = []
    }

    // Вход завершён — успех в аудит и сессия, как на одношаговом входе.
    await recordLoginAttempt(req, { kind: 'employee', login: payload.phone, success: true })
    const token = await createEmployeeSession(employee.id)
    const res = NextResponse.json({
      authenticated: true,
      employee: { id: employee.id, name: employee.name, roles },
    })
    res.cookies.set({ ...sessionCookieOptions(), value: token })
    return res
  } catch (e) {
    if (e instanceof TotpNotConfiguredError) {
      return NextResponse.json(
        { error: 'Двухфакторный вход не настроен на сервере. Обратитесь к мастеру.' },
        { status: 503 }
      )
    }
    console.error('[employee/login/totp] error:', e)
    return NextResponse.json({ error: 'Ошибка авторизации' }, { status: 500 })
  }
}
