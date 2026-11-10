import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { requireEmployee } from '@/lib/auth'
import { apiErrorResponse } from '@/lib/api-errors'
import { employeeActor } from '@/lib/activity'
import { CompanyUserError, confirmPhoneChange } from '@/lib/company-users'

type Params = { params: Promise<{ id: string }> }

// no-event: событие customer_user_phone_changed пишет ядро
// confirmPhoneChange (company-users.ts) в той же транзакции —
// роут только авторизует и валидирует (IC-03, образец волны 1).

// ─── BL-8, шаг 2: подтверждение смены телефона одноразовым кодом ─────
// (поток A волна 2, DF-25; план ред. 3 §5.2, контракт §8). Захват
// атомарный (updateMany WHERE hash+TTL+лимита, count===1 — паттерн
// AUD-04): применить код дважды, угадать после лимита или подтвердить
// чужую pending-заявку невозможно. Событие customer_user_phone_changed
// пишется в той же транзакции (кто/старый→новый/режим доставки);
// сессии пользователя не гасятся (смена логина ≠ компрометация).

const ConfirmSchema = z.object({
  userId: z.string().min(1),
  code: z.string().trim().min(1, 'Введите код из 6 цифр').max(12),
})

export async function POST(req: NextRequest, { params }: Params) {
  const auth = await requireEmployee(req, { write: true })
  if (!auth.ok) return auth.response

  const { id } = await params
  try {
    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Некорректный JSON в теле запроса' }, { status: 400 })
    }
    const parsed = ConfirmSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Некорректные данные', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const result = await db.$transaction((tx) =>
      confirmPhoneChange(tx, id, parsed.data.userId, parsed.data.code, employeeActor(auth.employee))
    )
    if (!result.ok) {
      return NextResponse.json({ error: result.message }, { status: result.status })
    }
    return NextResponse.json({ ok: true, phone: result.phone })
  } catch (e) {
    // К-12: параллельная выдача доступа успела занять номер между
    // шагом 1 и подтверждением — уникальный индекс CustomerUser_phone_key
    // отзывается P2002; pending-заявка остаётся, менеджер запрашивает
    // другой номер. Честный 409 вместо сырого 500.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return NextResponse.json(
        { error: 'Этот телефон уже занят пользователем другой компании' },
        { status: 409 }
      )
    }
    if (e instanceof CompanyUserError) {
      return NextResponse.json({ error: e.message }, { status: e.status })
    }
    return apiErrorResponse(e, 'access/phone-confirm POST', 'Не удалось подтвердить смену телефона')
  }
}
