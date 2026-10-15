import { NextRequest, NextResponse } from 'next/server'
import { getCurrentEmployee, destroySession, sessionCookieOptions, SESSION_COOKIE } from '@/lib/auth'

// POST /api/auth/employee/logout — удаляет сессию и чистит куку.
export async function POST(req: NextRequest) {
  const employee = await getCurrentEmployee(req)
  if (employee) {
    console.log(`[employee/logout] ${employee.name} (${employee.id}) вышел`)
  }
  const token = req.cookies.get(SESSION_COOKIE)?.value
  if (token) {
    await destroySession(token)
  }
  const res = NextResponse.json({ ok: true })
  // Кука с maxAge=0 в опциях сессии не подходит — собираем чистку вручную.
  res.cookies.set({
    ...sessionCookieOptions(),
    value: '',
    maxAge: 0,
  })
  return res
}
