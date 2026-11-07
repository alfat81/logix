// no-event: события пишет ядро permit-checks-db (permit_check_reviewed через emitEvent) — роут только авторизует и валидирует
import type { NextRequest } from 'next/server'
import { requireEmployee } from '@/lib/auth'
import { employeeActor } from '@/lib/activity'
import { parseAndReviewCheck } from '@/lib/permit-checks-http'

type Params = { params: Promise<{ id: string }> }

// ─── POST /api/admin/permit-checks/[id]/review — пересмотр (§5.7, §11.2) ────
// Только уполномоченный сотрудник (брокер пересмотр не выполняет — он
// может выполнить первичную проверку нового кода); атомарный захват
// открытой needs_review-записи → 409 повторному; решения по каждому
// активному требованию позиции; всё — одной транзакцией ядра.

export async function POST(req: NextRequest, { params }: Params) {
  const auth = await requireEmployee(req, { write: true })
  if (!auth.ok) return auth.response
  const { id } = await params
  return parseAndReviewCheck(id, req, employeeActor(auth.employee))
}
