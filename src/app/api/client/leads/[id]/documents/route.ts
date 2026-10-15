import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireClient } from '@/lib/client-auth'
import { clientActor } from '@/lib/activity'
import { apiErrorResponse } from '@/lib/api-errors'
import {
  DOC_PUBLIC_FIELDS,
  createDocumentOnDeal,
  parseDocumentCreateForm,
} from '@/lib/documents'

type Params = { params: Promise<{ id: string }> }

// ─── Документы запроса (лида) — кабинет клиента (Е) ───────────────
// Роадмап 5: «клиент загружает проект документа в своём ЛК» — в том
// числе на этапе запроса (предварительный инвойс нужен брокеру для
// расчёта пошлины ещё до заявки, 5а). Только СВОИ запросы (404 на
// чужие — факт существования не раскрываем, паттерн И1), только
// НЕ внутренние документы (isInternal в where, не в проекции —
// тайна видимости держится запросом).

export async function GET(req: NextRequest, { params }: Params) {
  const auth = await requireClient(req)
  if (!auth.ok) return auth.response

  const { id } = await params
  try {
    const lead = await db.lead.findFirst({
      where: { id, customerId: auth.client.id },
      select: { id: true },
    })
    if (!lead) {
      return NextResponse.json({ error: 'Запрос не найден' }, { status: 404 })
    }

    const documents = await db.document.findMany({
      where: { leadId: id, isInternal: false },
      select: DOC_PUBLIC_FIELDS,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    })
    return NextResponse.json({ documents })
  } catch (e) {
    return apiErrorResponse(e, 'client lead documents GET', 'Не удалось загрузить документы')
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  const auth = await requireClient(req)
  if (!auth.ok) return auth.response

  const { id } = await params
  try {
    const lead = await db.lead.findFirst({
      where: { id, customerId: auth.client.id },
      select: { id: true, order: { select: { id: true, number: true } } },
    })
    if (!lead) {
      return NextResponse.json({ error: 'Запрос не найден' }, { status: 404 })
    }
    if (lead.order) {
      return NextResponse.json(
        {
          error: `Запрос стал заявкой №${lead.order.number} — документы прикрепляйте в карточке заявки`,
        },
        { status: 409 }
      )
    }

    const parsed = await parseDocumentCreateForm(req)
    if (!parsed.ok) return parsed.response

    // Клиент не может создать внутренний документ: createDocumentOnDeal
    // принудительно гасит isInternal для не-сотрудников (роадмап 5 —
    // внутренние принадлежат менеджеру).
    const document = await createDocumentOnDeal(
      { leadId: id },
      clientActor(auth.client),
      parsed.meta,
      parsed.file
    )
    return NextResponse.json({ document }, { status: 201 })
  } catch (e) {
    return apiErrorResponse(e, 'client lead documents POST', 'Не удалось загрузить документ')
  }
}
