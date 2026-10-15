import { NextRequest, NextResponse } from 'next/server'
import { getCurrentEmployee } from '@/lib/auth'

// GET /api/auth/employee/me — текущий сотрудник (для UI-редиректов).
export async function GET(req: NextRequest) {
  const employee = await getCurrentEmployee(req)
  if (!employee) {
    return NextResponse.json({ authenticated: false }, { status: 401 })
  }
  return NextResponse.json({
    authenticated: true,
    employee,
  })
}
