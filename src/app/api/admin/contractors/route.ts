import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireEmployee } from '@/lib/auth'
import { CONTRACTOR_PUBLIC_FIELDS } from '@/lib/contractors'
import { apiErrorResponse } from '@/lib/api-errors'

// ─── GET /api/admin/contractors — справочник пула (Г3) ───────────
// Query: ?active=true|false — витрина пула против исключённых
// (фильтр UI Г5). Без параметра — весь справочник. Свежие сверху.
//
// DELETE в этом справочнике не существует вовсе (очередь Г3): история
// заявок не должна терять исполнителей, «удаление» = isActive=false
// через PATCH /[id]. Поэтому роут сознательно содержит ТОЛЬКО GET —
// POST здесь тоже нет: подрядчик не создаётся руками «в никуда»,
// только рождается из кандидата квалификации (Г2).
//
// _count.stages — сколько этапов сейчас назначено: у исключённого из
// пула сразу видно, что он «ещё работает» (мягкое исключение не рвёт
// существующие назначения).
export async function GET(req: NextRequest) {
  const auth = await requireEmployee(req)
  if (!auth.ok) return auth.response

  const active = req.nextUrl.searchParams.get('active')
  if (active !== null && active !== 'true' && active !== 'false') {
    return NextResponse.json(
      { error: 'Параметр active принимает только true или false' },
      { status: 400 }
    )
  }

  try {
    const contractors = await db.contractor.findMany({
      where: active !== null ? { isActive: active === 'true' } : undefined,
      orderBy: { createdAt: 'desc' },
      select: {
        ...CONTRACTOR_PUBLIC_FIELDS,
        _count: { select: { stages: true } },
      },
    })

    return NextResponse.json({ contractors })
  } catch (e) {
    return apiErrorResponse(e, 'contractors GET', 'Не удалось загрузить пул подрядчиков')
  }
}
