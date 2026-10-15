import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireClient } from '@/lib/client-auth'
import { apiErrorResponse } from '@/lib/api-errors'

type Params = { params: Promise<{ id: string }> }

// ─── Карточка запроса (лида) в кабинете клиента (Е) ───────────────
// До Е клиент видел свои запросы только списком; теперь у запроса
// есть карточка — анкета, которую он отправлял, статус и документы
// (роадмап 5: предварительный инвойс для расчёта грузится клиентом
// ещё до заявки). Проекция без lostReason и вариантов (цены клиенту
// не показываются — решение №1), только свои запросы (404 на чужие).

const CLIENT_LEAD_DETAIL_SELECT = {
  id: true,
  status: true,
  createdAt: true,
  cargoInfo: true,
  order: { select: { id: true, number: true } },
} as const

export async function GET(req: NextRequest, { params }: Params) {
  const auth = await requireClient(req)
  if (!auth.ok) return auth.response

  const { id } = await params
  try {
    const lead = await db.lead.findFirst({
      where: { id, customerId: auth.client.id },
      select: CLIENT_LEAD_DETAIL_SELECT,
    })
    if (!lead) {
      return NextResponse.json({ error: 'Запрос не найден' }, { status: 404 })
    }
    return NextResponse.json({ lead })
  } catch (e) {
    return apiErrorResponse(e, 'client lead detail GET', 'Не удалось загрузить запрос')
  }
}
