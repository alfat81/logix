import { NextRequest, NextResponse } from 'next/server'
import { requireEmployee } from '@/lib/auth'
import { apiErrorResponse } from '@/lib/api-errors'
import { revokeAllSessions } from '@/lib/totp-db'

// DELETE /api/admin/profile/sessions — «Выйти на всех устройствах»
// (DF-09): удаляет ВСЕ сессии текущего сотрудника, включая текущую —
// после ответа клиент уходит на страницу входа. Область действия —
// только собственная учётка (id из сессии, чужой id в запросе не
// принимается по построению).
//
// no-event: сессионное действие без данных сделки и без смены
// состояния учётки (прецедент — logout без события).
export async function DELETE(req: NextRequest) {
  const auth = await requireEmployee(req, { write: true })
  if (!auth.ok) return auth.response
  try {
    const revoked = await revokeAllSessions(auth.employee.id)
    return NextResponse.json({ ok: true, revoked })
  } catch (e) {
    return apiErrorResponse(e, 'profile/sessions DELETE', 'Не удалось завершить сессии')
  }
}
