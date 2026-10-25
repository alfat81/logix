import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireEmployee } from '@/lib/auth'
import { employeeActor } from '@/lib/activity'
import { apiErrorResponse } from '@/lib/api-errors'
import {
  DOC_PUBLIC_FIELDS,
  createDocumentOnDeal,
  parseDocumentCreateForm,
} from '@/lib/documents'

type Params = { params: Promise<{ id: string }> }

// ─── Документы лида (Е, роадмап 5) — кабинет менеджера ────────────
// GET  — все документы лида (включая внутренние — менеджер видит всё).
// POST — загрузить документ (multipart: type, title, isInternal,
//        comment, file). Лид с заявкой (won) — 409: сделка живёт
//        заявкой, документы при конвертации переехали туда (симметрия
//        с подключением брокера Д: «подключайте к заявке»).

export async function GET(req: NextRequest, { params }: Params) {
  const auth = await requireEmployee(req)
  if (!auth.ok) return auth.response

  const { id } = await params
  try {
    const lead = await db.lead.findUnique({
      where: { id },
      select: { id: true },
    })
    if (!lead) {
      return NextResponse.json({ error: 'Запрос не найден' }, { status: 404 })
    }

    const documents = await db.document.findMany({
      where: { leadId: id },
      select: DOC_PUBLIC_FIELDS,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    })
    return NextResponse.json({ documents })
  } catch (e) {
    return apiErrorResponse(e, 'lead documents GET', 'Не удалось загрузить документы')
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  const auth = await requireEmployee(req, { write: true })
  if (!auth.ok) return auth.response

  const { id } = await params
  try {
    const lead = await db.lead.findUnique({
      where: { id },
      select: { id: true, status: true, order: { select: { id: true, number: true } } },
    })
    if (!lead) {
      return NextResponse.json({ error: 'Запрос не найден' }, { status: 404 })
    }
    if (lead.order) {
      return NextResponse.json(
        {
          error: `Сделка перешла в заявку №${lead.order.number} — прикрепляйте документы к заявке`,
        },
        { status: 409 }
      )
    }

    const parsed = await parseDocumentCreateForm(req)
    if (!parsed.ok) return parsed.response

    const document = await createDocumentOnDeal(
      { leadId: id },
      employeeActor(auth.employee),
      parsed.meta,
      parsed.file
    )
    return NextResponse.json({ document }, { status: 201 })
  } catch (e) {
    return apiErrorResponse(e, 'lead documents POST', 'Не удалось загрузить документ')
  }
}
