// no-event: события пишут ядром lib/lead-confirm.ts (confirmLeadOption → lead_client_confirmed) в той же транзакции подтверждения
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireEmployee } from '@/lib/auth'
import { apiErrorResponse } from '@/lib/api-errors'
import { employeeActor } from '@/lib/activity'
import { LEAD_CONFIRM_VIA_LABELS } from '@/lib/leads'
import { confirmLeadOption } from '@/lib/lead-confirm'
import { loadLeadCard } from '../convert/helpers'

type Params = { params: Promise<{ id: string }> }

// ─── POST /api/admin/leads/[id]/confirm — BL-2 (поток A волна 1) ────
// Фиксация согласия менеджером от имени клиента (согласование произошло
// вне системы). Сохраняется кто/как/когда: clientConfirmedVia =
// manager_on_behalf, id+имя сотрудника снимком. Если optionId не указан —
// берётся текущий выбранный вариант (isSelected); ни выбранного, ни
// optionId → 400. Транзакция и снимок — те же, что у клиента в кабинете
// (lib/lead-confirm.ts); гонки К-02/К-04 разводит блокировка строки лида.

const ConfirmSchema = z.object({
  optionId: z.string().min(1).optional(),
})

export async function POST(req: NextRequest, { params }: Params) {
  const auth = await requireEmployee(req, { write: true })
  if (!auth.ok) return auth.response

  const { id } = await params
  try {
    let body: unknown = {}
    try {
      body = await req.json()
    } catch {
      body = {} // тело необязательно — допускаем пустой POST
    }
    const parsed = ConfirmSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Некорректные данные', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const lead = await db.lead.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        customerId: true,
        options: { select: { id: true, isSelected: true } },
      },
    })
    if (!lead) {
      return NextResponse.json({ error: 'Запрос не найден' }, { status: 404 })
    }

    // optionId не указан → текущий выбранный вариант; его нет → 400
    let optionId = parsed.data.optionId
    if (!optionId) {
      const selected = lead.options.find((o) => o.isSelected)
      if (!selected) {
        return NextResponse.json(
          { error: 'Выбранный вариант не найден — укажите optionId или выберите вариант расчёта' },
          { status: 400 }
        )
      }
      optionId = selected.id
    }

    const result = await db.$transaction(
      async (tx) =>
        confirmLeadOption(tx, id, optionId as string, {
          actor: employeeActor(auth.employee),
          via: 'manager_on_behalf',
          byId: auth.employee.id,
          byName: auth.employee.name,
        }),
      { timeout: 15000, maxWait: 5000 }
    )

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    const updatedLead = await loadLeadCard(id)
    return NextResponse.json(
      {
        ok: true,
        optionId: result.optionId,
        confirmedAt: result.confirmedAt,
        lead: updatedLead,
        message: `Согласие зафиксировано (${LEAD_CONFIRM_VIA_LABELS.manager_on_behalf}) — запрос ожидает конвертации`,
      },
      { status: 200 }
    )
  } catch (e) {
    return apiErrorResponse(e, 'lead confirm', 'Не удалось зафиксировать согласие клиента')
  }
}
