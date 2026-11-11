import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireClient } from '@/lib/client-auth'
import { apiErrorResponse } from '@/lib/api-errors'
import { ownLeadOr404 } from '@/lib/client-scope'

type Params = { params: Promise<{ id: string }> }

// GET /api/client/leads/[id]/print-revisions — печатные редакции СВОЕГО
// запроса (Р-3): клиент видит редакции и статусы подтверждений, чтобы
// подтвердить актуальную. Содержимое снимка — данные самого клиента;
// историю его внутренних расчётов проекция не раскрывает (D3).
export async function GET(req: NextRequest, { params }: Params) {
  const auth = await requireClient(req)
  if (!auth.ok) return auth.response

  const { id } = await params
  try {
    const lead = await ownLeadOr404(db, id, auth.client.id)
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
        contentHash: true,
        createdAt: true,
        confirmations: {
          select: { partyRole: true, actorName: true, confirmedAt: true },
        },
      },
    })
    return NextResponse.json({ revisions })
  } catch (e) {
    return apiErrorResponse(e, 'client print-revisions GET', 'Не удалось загрузить редакции')
  }
}
