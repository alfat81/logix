import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireEmployee } from '@/lib/auth'
import { apiErrorResponse } from '@/lib/api-errors'
import { CompanyUserError, startPhoneChange } from '@/lib/company-users'

type Params = { params: Promise<{ id: string }> }

// no-event: событие на шаге 1 не пишется — заявка pending ещё не факт
// (перезаписывается повторным шагом 1, истекает через 15 мин); журнал
// фиксирует результат — customer_user_phone_changed от ядра
// confirmPhoneChange на шаге 2 (IC-03, решение волны 2).

// ─── BL-8, шаг 1: заявка на смену телефона пользователя компании ─────
// (поток A волна 2, DF-25; план ред. 3 §5.2, контракт §8). Сотрудник
// (write) запрашивает одноразовый код на НОВЫЙ номер: нормализация
// +7…, глобальная занятость (AUD-03, К-12 backstop в lib), TTL 15 мин,
// лимит 5 попыток (шаг 2). Доставка кода — ручной режим
// (manual_by_manager): WhatsApp/SMS-шлюза нет (P2-01), код возвращается
// менеджеру в ответе — сообщить клиенту по телефону/мессенджеру.
// Сменить телефон прямым PATCH больше нельзя — только эта операция.

const StartSchema = z.object({
  userId: z.string().min(1),
  newPhone: z.string().trim().min(1, 'Укажите новый телефон').max(30),
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
    const parsed = StartSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Некорректные данные', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const result = await db.$transaction((tx) =>
      startPhoneChange(tx, id, parsed.data.userId, parsed.data.newPhone)
    )
    return NextResponse.json(result)
  } catch (e) {
    if (e instanceof CompanyUserError) {
      return NextResponse.json({ error: e.message }, { status: e.status })
    }
    return apiErrorResponse(e, 'access/phone-change POST', 'Не удалось выдать код смены телефона')
  }
}
