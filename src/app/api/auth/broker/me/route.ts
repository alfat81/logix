import { NextRequest, NextResponse } from 'next/server'
import { getCurrentBroker } from '@/lib/broker-auth'

// GET /api/auth/broker/me — текущий брокер для UI-редиректов и шапки
// портала (зеркало employee/me, contractor/me и client/me).
export async function GET(req: NextRequest) {
  const broker = await getCurrentBroker(req)
  if (!broker) {
    return NextResponse.json({ authenticated: false }, { status: 401 })
  }
  return NextResponse.json({
    authenticated: true,
    broker,
  })
}
