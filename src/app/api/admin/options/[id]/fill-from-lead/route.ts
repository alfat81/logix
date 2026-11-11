import { NextRequest, NextResponse } from 'next/server'
import { requireEmployee } from '@/lib/auth'
import { apiErrorResponse } from '@/lib/api-errors'
import { fillFromLead } from '@/lib/option-write'

type Params = { params: Promise<{ id: string }> }

// ─── POST /api/admin/options/[id]/fill-from-lead — «Заполнить из
// запроса» (DF-27, план §4.5): снимки постфактум для легаси-варианта.
// no-event: события пишет ядро lib/option-write.ts (option_updated +
// ревизия filled_from_lead — в той же транзакции сохранения).
export async function POST(req: NextRequest, { params }: Params) {
  const auth = await requireEmployee(req, { write: true })
  if (!auth.ok) return auth.response

  const { id } = await params
  try {
    const result = await fillFromLead(id, auth.employee)
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json({ option: result.option, message: 'Вариант заполнен из запроса' })
  } catch (e) {
    return apiErrorResponse(e, 'option fill-from-lead', 'Не удалось заполнить вариант из запроса')
  }
}
