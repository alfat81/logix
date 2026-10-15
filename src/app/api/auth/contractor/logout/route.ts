import { NextRequest, NextResponse } from 'next/server'
import {
  getCurrentContractor,
  destroyContractorSession,
  contractorSessionCookieOptions,
  CONTRACTOR_SESSION_COOKIE,
} from '@/lib/contractor-auth'

// POST /api/auth/contractor/logout — удаляет сессию и чистит куку
// (зеркало employee-логаута из А5).
export async function POST(req: NextRequest) {
  const contractor = await getCurrentContractor(req)
  if (contractor) {
    console.log(`[contractor/logout] ${contractor.companyName} (${contractor.id}) вышел`)
  }
  const token = req.cookies.get(CONTRACTOR_SESSION_COOKIE)?.value
  if (token) {
    await destroyContractorSession(token)
  }
  const res = NextResponse.json({ ok: true })
  res.cookies.set({
    ...contractorSessionCookieOptions(),
    value: '',
    maxAge: 0,
  })
  return res
}
