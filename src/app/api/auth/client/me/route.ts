import { NextRequest, NextResponse } from 'next/server'
import { getCurrentClient } from '@/lib/client-auth'

// GET /api/auth/client/me — текущий клиент для UI-редиректов и шапки
// кабинета (зеркало employee/me и contractor/me).
export async function GET(req: NextRequest) {
  const client = await getCurrentClient(req)
  if (!client) {
    return NextResponse.json({ authenticated: false }, { status: 401 })
  }
  return NextResponse.json({
    authenticated: true,
    client,
  })
}
