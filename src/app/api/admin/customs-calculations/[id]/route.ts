import { NextRequest, NextResponse } from 'next/server'
import { calcErrorResponse, requireCalcWriter } from '@/lib/customs-api'
import { updateCalculation } from '@/lib/customs-server'

type Params = { params: Promise<{ id: string }> }

// ─── PUT /api/admin/customs-calculations/[id] — правка черновика ──────
// DF-19, ответ брокера «возможность правок нужна» (D40): менеджер
// редактирует входные данные и строки АКТУАЛЬНОЙ версии, сервер
// пересчитывает. История версий — POST (пересчёт новой версией);
// неактуальные версии не правятся (400). Только сотрудники.
// Разбор тела и маппинг ошибок — общий хвост lib/customs-api.ts.

export async function PUT(req: NextRequest, { params }: Params) {
  const ctx = await requireCalcWriter(req, params)
  if (ctx.response) return ctx.response
  try {
    const calculation = await updateCalculation({
      id: ctx.id,
      input: ctx.input,
      employee: ctx.employee,
    })
    return NextResponse.json({ calculation })
  } catch (e) {
    return calcErrorResponse(e, 'customs-calculations PUT', 'Не удалось сохранить расчёт')
  }
}
