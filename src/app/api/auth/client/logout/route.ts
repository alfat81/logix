import { NextRequest, NextResponse } from 'next/server'
import {
  getCurrentClient,
  destroyClientSession,
  clientSessionCookieOptions,
  CLIENT_SESSION_COOKIE,
} from '@/lib/client-auth'

// POST /api/auth/client/logout — удаляет сессию и чистит куку
// (зеркало employee/contractor-логаутов, А5/Г4).
export async function POST(req: NextRequest) {
  const client = await getCurrentClient(req)
  if (client) {
    console.log(`[client/logout] ${client.name} (${client.id}) вышел`)
  }
  const token = req.cookies.get(CLIENT_SESSION_COOKIE)?.value
  if (token) {
    await destroyClientSession(token)
  }
  const res = NextResponse.json({ ok: true })
  res.cookies.set({
    ...clientSessionCookieOptions(),
    value: '',
    maxAge: 0,
  })
  return res
}
