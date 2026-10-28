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
import { projectDocumentAuthors, STAFF_READER } from '@/lib/actor-name'

type Params = { params: Promise<{ id: string }> }

// ─── Документы заявки (Е, роадмап 5) — кабинет менеджера ──────────
// GET  — все документы заявки, включая внутренние.
// POST — загрузить документ. Статус заявки не ограничивает: обмен
//        документами живёт и в исполнении, и в завершённой сделке
//        (закрывающие УПД приходят в самом конце).

export async function GET(req: NextRequest, { params }: Params) {
  const auth = await requireEmployee(req)
  if (!auth.ok) return auth.response

  const { id } = await params
  try {
    const order = await db.order.findUnique({
      where: { id },
      select: { id: true },
    })
    if (!order) {
      return NextResponse.json({ error: 'Заявка не найдена' }, { status: 404 })
    }

    const documents = await db.document.findMany({
      where: { orderId: id },
      select: DOC_PUBLIC_FIELDS,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    })
    // DF-02A (Блок 4): автор версии — человек; сотруднику —
    // «Имя (Компания)» (устаревшие версии — компания, как было).
    return NextResponse.json({
      documents: await projectDocumentAuthors(documents, STAFF_READER),
    })
  } catch (e) {
    return apiErrorResponse(e, 'order documents GET', 'Не удалось загрузить документы')
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  const auth = await requireEmployee(req, { write: true })
  if (!auth.ok) return auth.response

  const { id } = await params
  try {
    const order = await db.order.findUnique({
      where: { id },
      select: { id: true, number: true },
    })
    if (!order) {
      return NextResponse.json({ error: 'Заявка не найдена' }, { status: 404 })
    }

    const parsed = await parseDocumentCreateForm(req)
    if (!parsed.ok) return parsed.response

    const document = await createDocumentOnDeal(
      { orderId: id },
      employeeActor(auth.employee),
      parsed.meta,
      parsed.file
    )
    return NextResponse.json({ document }, { status: 201 })
  } catch (e) {
    return apiErrorResponse(e, 'order documents POST', 'Не удалось загрузить документ')
  }
}
