// no-event: события пишут ядра (permit-checks-db: permit_* через emitEvent) — роут только авторизует и валидирует
import type { NextRequest } from 'next/server'
import { requireBroker } from '@/lib/broker-auth'
import { brokerActor } from '@/lib/activity'
import { permitChecksGet, permitChecksPost } from '@/lib/permit-checks-http'

type Params = { params: Promise<{ id: string }> }

// ─── GET/POST /api/broker/leads/[id]/permit-checks — проверки ТН ВЭД (запроса (портал брокера, своя сделка)) ───
// (DF-26 волна 2, §5.1–5.3/§11.2). Гард — здесь, логика — permit-checks-http.

export async function GET(req: NextRequest, { params }: Params) {
  const auth = await requireBroker(req)
  if (!auth.ok) return auth.response
  const { id } = await params
  return permitChecksGet(id, { kind: 'broker-lead' }, { kind: 'broker', broker: brokerActor(auth.broker) })
}

export async function POST(req: NextRequest, { params }: Params) {
  const auth = await requireBroker(req)
  if (!auth.ok) return auth.response
  const { id } = await params
  return permitChecksPost(req, id, { kind: 'broker-lead' }, { kind: 'broker', broker: brokerActor(auth.broker) })
}
