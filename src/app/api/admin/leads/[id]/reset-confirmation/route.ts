// no-event: события пишут ядром lib/lead-confirm.ts (resetLeadConfirmation → lead_confirmation_reset) в той же транзакции сброса
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireEmployee } from '@/lib/auth'
import { apiErrorResponse } from '@/lib/api-errors'
import { employeeActor } from '@/lib/activity'
import { resetLeadConfirmation } from '@/lib/lead-confirm'
import { loadLeadCard } from '../convert/helpers'

type Params = { params: Promise<{ id: string }> }

// ─── POST /api/admin/leads/[id]/reset-confirmation — BL-3 «Изменить условия» ──
// Единственный путь изменить зафиксированные условия (уровень 1 защиты,
// план §1 п. 8): сброс согласования — статус → calculated, метаданные
// согласования очищаются, isSelected варианта сохраняется («текущий
// выбор»), исторические снимки НЕ удаляются и НЕ правятся (уровень 2).
// После сброса требуется повторное подтверждение — клиентом в кабинете
// или менеджером от имени; клиенту уходит письмо (lead_confirmation_reset,
// реестр §2.3). Гонка К-05/К-06/К-09 разводится блокировкой строки лида.

export async function POST(req: NextRequest, { params }: Params) {
  const auth = await requireEmployee(req, { write: true })
  if (!auth.ok) return auth.response

  const { id } = await params
  try {
    const result = await db.$transaction(
      async (tx) => resetLeadConfirmation(tx, id, employeeActor(auth.employee)),
      { timeout: 15000, maxWait: 5000 }
    )

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    const updatedLead = await loadLeadCard(id)
    return NextResponse.json({
      ok: true,
      lead: updatedLead,
      message: 'Согласование сброшено — условия изменены; требуется повторное согласование клиента',
    })
  } catch (e) {
    return apiErrorResponse(e, 'lead reset-confirmation', 'Не удалось сбросить согласование')
  }
}
