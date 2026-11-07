// no-event: события пишет ядро document-confirm (document_created/document_version_added + permit_received в транзакции confirm)
import { NextRequest, NextResponse } from 'next/server'
import { requireEmployee } from '@/lib/auth'
import { employeeActor } from '@/lib/activity'
import { apiErrorResponse } from '@/lib/api-errors'
import {
  confirmDocumentVersion,
  loadVersionForConfirm,
} from '@/lib/document-confirm'
import { readJsonBody } from '@/lib/document-upload'
import { parseConfirmPermitOpts } from '@/lib/document-confirm'

type Params = { params: Promise<{ id: string }> }

// ─── Шаг 3 загрузки (DF-11) — кабинет менеджера ────────────────────
// Сотрудник подтверждает любую pending-загрузку по своим сделкам: сервер
// читает первые байты и размер объекта, проверяет сигнатуру и лимит,
// переводит версию в ready. permitRequirementId — закрытие строки
// разрешительных тем же документом (DF-16).
export async function POST(req: NextRequest, { params }: Params) {
  const auth = await requireEmployee(req, { write: true })
  if (!auth.ok) return auth.response

  const { id } = await params
  try {
    const body = await readJsonBody(req)
    // DF-26 волна 2 (§6.4 п. 1): один документ — несколько требований
    // (парсер общий — permit-checks-http не нужен, document-confirm).
    const opts = parseConfirmPermitOpts(body)
    const permitIds = [
      ...(opts.permitRequirementId ? [opts.permitRequirementId] : []),
      ...(opts.permitRequirementIds ?? []),
    ]
    const pending = await loadVersionForConfirm(id)
    if (!pending) {
      return NextResponse.json({ error: 'Версия не найдена' }, { status: 404 })
    }

    const outcome = await confirmDocumentVersion(pending, employeeActor(auth.employee), opts)
    if (!outcome.ok) {
      return NextResponse.json({ error: outcome.error }, { status: outcome.status })
    }
    return NextResponse.json(
      { version: outcome.version, document: outcome.document, permitId: outcome.permitIds[0], permitIds: outcome.permitIds },
      { status: 200 }
    )
  } catch (e) {
    return apiErrorResponse(e, 'document confirm POST (admin)', 'Не удалось подтвердить загрузку')
  }
}
