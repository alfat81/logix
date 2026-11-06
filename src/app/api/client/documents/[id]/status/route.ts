import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireClient } from '@/lib/client-auth'
import { clientActor } from '@/lib/activity'
import { apiErrorResponse } from '@/lib/api-errors'
import { documentVisibleToClient } from '@/lib/documents'
import { submitDocumentForReview } from '@/lib/document-lifecycle'

type Params = { params: Promise<{ id: string }> }

// ─── DF-26: «отправить на проверку» — автор документа в кабинете клиента
// PATCH { status: 'in_review' }: переход доступен АВТОРУ (§14.2) —
// пользователю, загрузившему хотя бы одну версию документа. Чужой
// документ (не ваша сделка / не ваш автор) — единый 404 (паттерн И1).

export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await requireClient(req)
  if (!auth.ok) return auth.response

  const { id } = await params
  try {
    const body = (await req.json().catch(() => null)) as { status?: string } | null
    if (body?.status !== 'in_review') {
      return NextResponse.json(
        { error: 'Поддерживается только переход draft → in_review' },
        { status: 400 },
      )
    }
    const visible = await documentVisibleToClient(id, auth.client.id)
    if (!visible) {
      return NextResponse.json({ error: 'Документ не найден' }, { status: 404 })
    }
    const authorVersion = await db.documentVersion.findFirst({
      where: { documentId: id, authorType: 'client', authorId: auth.client.userId },
      select: { id: true },
    })
    if (!authorVersion) {
      return NextResponse.json({ error: 'Документ не найден' }, { status: 404 })
    }
    const document = await submitDocumentForReview(id, clientActor(auth.client))
    if (!document) {
      return NextResponse.json({ error: 'Документ не найден' }, { status: 404 })
    }
    return NextResponse.json({ document })
  } catch (e) {
    return apiErrorResponse(e, 'client document status PATCH', 'Не удалось отправить документ на проверку')
  }
}
