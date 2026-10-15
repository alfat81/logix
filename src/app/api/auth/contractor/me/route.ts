import { NextRequest, NextResponse } from 'next/server'
import { getCurrentContractor } from '@/lib/contractor-auth'

// GET /api/auth/contractor/me — текущий подрядчик для UI-редиректов
// и шапки портала (зеркало employee/me из А5).
export async function GET(req: NextRequest) {
  const contractor = await getCurrentContractor(req)
  if (!contractor) {
    return NextResponse.json({ authenticated: false }, { status: 401 })
  }
  return NextResponse.json({
    authenticated: true,
    contractor,
  })
}
