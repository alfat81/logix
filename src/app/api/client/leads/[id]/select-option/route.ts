// no-event: события пишут ядром lib/lead-confirm.ts (confirmLeadOption → lead_client_confirmed) в той же транзакции подтверждения
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireClient } from '@/lib/client-auth'
import { apiErrorResponse } from '@/lib/api-errors'
import { clientActor } from '@/lib/activity'
import { LEAD_CONFIRM_VIA_LABELS } from '@/lib/leads'
import { confirmLeadOption } from '@/lib/lead-confirm'

type Params = { params: Promise<{ id: string }> }

// ─── POST /api/client/leads/[id]/select-option — BL-1 (поток A волна 1) ──
// Клиент видит варианты расчёта и продажные цены (пересмотр решения №1 —
// решение владельца 04.11.2026, D49) и фиксирует согласие кнопкой
// «Согласовать этот вариант». Согласие = принятие коммерческих условий;
// заявку оно автоматически НЕ создаёт — менеджер конвертирует после.
// В транзакции (lib/lead-confirm.ts): блокировка строки лида, метаданные
// (кто/как/когда), исторический снимок условий, событие в ленты.
// Повторное подтверждение → 409 «уже согласован» (К-02/К-10).

const SelectOptionSchema = z.object({
  optionId: z.string().min(1, 'Укажите вариант расчёта'),
})

export async function POST(req: NextRequest, { params }: Params) {
  const auth = await requireClient(req)
  if (!auth.ok) return auth.response

  const { id } = await params
  try {
    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Некорректный JSON в теле запроса' }, { status: 400 })
    }
    const parsed = SelectOptionSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Некорректные данные', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    // Только СВОЙ запрос (404 на чужие — паттерн клиентских роутов).
    const lead = await db.lead.findFirst({
      where: { id, customerId: auth.client.id },
      select: { id: true, status: true },
    })
    if (!lead) {
      return NextResponse.json({ error: 'Запрос не найден' }, { status: 404 })
    }

    const result = await db.$transaction(
      async (tx) =>
        confirmLeadOption(tx, id, parsed.data.optionId, {
          actor: clientActor(auth.client),
          via: 'client_portal',
          byId: auth.client.userId,
          byName: auth.client.userName,
        }),
      { timeout: 15000, maxWait: 5000 }
    )

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(
      {
        ok: true,
        optionId: result.optionId,
        confirmedAt: result.confirmedAt,
        message: `Вариант согласован (${LEAD_CONFIRM_VIA_LABELS.client_portal}) — заявку создаст менеджер`,
      },
      { status: 200 }
    )
  } catch (e) {
    return apiErrorResponse(e, 'client lead select-option', 'Не удалось согласовать вариант')
  }
}
