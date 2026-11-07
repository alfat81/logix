// no-event: события пишут ядра (permit-checks-db: permit_* через emitEvent) — роут только авторизует и валидирует
import type { NextRequest } from 'next/server'
import { requireEmployee } from '@/lib/auth'
import { employeeActor } from '@/lib/activity'
import { permitChecksGet, permitChecksPost } from '@/lib/permit-checks-http'

type Params = { params: Promise<{ id: string }> }

// ─── GET/POST /api/admin/leads/[id]/permit-checks — проверки ТН ВЭД (запроса (сотрудники)) ───
// (DF-26 волна 2, §5.1–5.3/§11.2). Гард — здесь, логика — permit-checks-http.

export async function GET(req: NextRequest, { params }: Params) {
  const auth = await requireEmployee(req)
  if (!auth.ok) return auth.response
  const { id } = await params
  return permitChecksGet(id, { kind: 'admin-lead' }, { kind: 'staff', employee: employeeActor(auth.employee) })
}

export async function POST(req: NextRequest, { params }: Params) {
  const auth = await requireEmployee(req, { write: true })
  if (!auth.ok) return auth.response
  const { id } = await params
  return permitChecksPost(req, id, { kind: 'admin-lead' }, { kind: 'staff', employee: employeeActor(auth.employee) })
}
