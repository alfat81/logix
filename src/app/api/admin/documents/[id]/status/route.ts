import { NextRequest, NextResponse } from 'next/server'
import { requireEmployee } from '@/lib/auth'
import { employeeActor } from '@/lib/activity'
import { apiErrorResponse } from '@/lib/api-errors'
import { submitDocumentForReview } from '@/lib/document-lifecycle'

type Params = { params: Promise<{ id: string }> }

// ─── DF-26: «отправить на проверку» (draft → in_review) — сотрудник ──
// PATCH { status: 'in_review' }: единственный переход этого роута —
// новый (матрица DOCUMENT_TRANSITIONS расширяет draft). Финализация и
// «Вернуть в работу» остаются на своих роутах (finalize/reopen).
// Повторный перевод/чужой статус — 409 по матрице переходов.

export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await requireEmployee(req, { write: true })
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
    const document = await submitDocumentForReview(id, employeeActor(auth.employee))
    if (!document) {
      return NextResponse.json({ error: 'Документ не найден' }, { status: 404 })
    }
    return NextResponse.json({ document })
  } catch (e) {
    return apiErrorResponse(e, 'document status PATCH', 'Не удалось отправить документ на проверку')
  }
}
