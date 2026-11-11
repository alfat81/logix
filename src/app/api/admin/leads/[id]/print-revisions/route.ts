import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireEmployee } from '@/lib/auth'
import { apiErrorResponse } from '@/lib/api-errors'
import { employeeActor } from '@/lib/activity'
import { emitEvent } from '@/lib/events'
import { createPrintRevision } from '@/lib/print-revisions'

type Params = { params: Promise<{ id: string }> }

// ─── DF-27 волна 2 (Р-3, D75): печатные редакции заявки ─────────────
// GET  — список редакций с подтверждениями (staff: полная история).
// POST — создать новую неизменяемую редакцию (append-only): снимок
//        полей печатной формы + contentHash; содержимое после создания
//        не меняется — правка состава = новая редакция. Гарды: запрос
//        не закрыт (won/lost). Редакция — подтверждение СОСТАВА сведений,
//        не цены: предварительная оценка окончательной не становится.

// Список: редакции + подтверждения (кто/когда/как) — для карточки лида
export async function GET(req: NextRequest, { params }: Params) {
  const auth = await requireEmployee(req)
  if (!auth.ok) return auth.response

  const { id } = await params
  try {
    const lead = await db.lead.findUnique({ where: { id }, select: { id: true } })
    if (!lead) {
      return NextResponse.json({ error: 'Запрос не найден' }, { status: 404 })
    }
    const revisions = await db.leadPrintRevision.findMany({
      where: { leadId: id },
      orderBy: { seq: 'desc' },
      select: {
        id: true,
        seq: true,
        leadSnapshot: true,
        renderedFileId: true,
        contentHash: true,
        createdById: true,
        createdByName: true,
        createdAt: true,
        confirmations: {
          select: {
            partyRole: true,
            actorName: true,
            confirmedAt: true,
            method: true,
            comment: true,
          },
        },
      },
    })
    return NextResponse.json({ revisions })
  } catch (e) {
    return apiErrorResponse(e, 'print-revisions GET', 'Не удалось загрузить редакции')
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  const auth = await requireEmployee(req, { write: true })
  if (!auth.ok) return auth.response

  const { id } = await params
  try {
    const lead = await db.lead.findUnique({
      where: { id },
      select: { id: true, status: true },
    })
    if (!lead) {
      return NextResponse.json({ error: 'Запрос не найден' }, { status: 404 })
    }
    if (lead.status === 'won' || lead.status === 'lost') {
      return NextResponse.json(
        { error: 'Запрос закрыт — новая печатная редакция недоступна' },
        { status: 409 }
      )
    }

    const actor = employeeActor(auth.employee)
    const result = await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Lead" WHERE id = ${id} FOR UPDATE`
      const created = await createPrintRevision(tx, id, {
        id: actor.id,
        name: actor.name,
      })
      await emitEvent(tx, {
        target: { leadId: id },
        actor,
        type: 'lead_print_revision_created',
        description: `Сформирована печатная редакция заявки №${created.seq} (${actor.name})`,
      })
      return created
    })

    return NextResponse.json(
      {
        revision: result,
        message: `Печатная редакция №${result.seq} создана — ожидает подтверждения клиента и менеджера`,
      },
      { status: 201 }
    )
  } catch (e) {
    return apiErrorResponse(e, 'print-revisions POST', 'Не удалось создать редакцию')
  }
}
