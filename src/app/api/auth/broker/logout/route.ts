import { NextRequest, NextResponse } from 'next/server'
import {
  getCurrentBroker,
  destroyBrokerSession,
  brokerSessionCookieOptions,
  BROKER_SESSION_COOKIE,
} from '@/lib/broker-auth'

// POST /api/auth/broker/logout — удаляет сессию и чистит куку
// (зеркало employee/contractor/client-логаутов, А5/Г4/И1).
export async function POST(req: NextRequest) {
  const broker = await getCurrentBroker(req)
  if (broker) {
    console.log(`[broker/logout] ${broker.companyName} (${broker.id}) вышел`)
  }
  const token = req.cookies.get(BROKER_SESSION_COOKIE)?.value
  if (token) {
    await destroyBrokerSession(token)
  }
  const res = NextResponse.json({ ok: true })
  res.cookies.set({
    ...brokerSessionCookieOptions(),
    value: '',
    maxAge: 0,
  })
  return res
}
