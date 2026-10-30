import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getEmployeeByToken, SESSION_COOKIE } from '@/lib/auth'
import { PulseScreen } from '@/components/admin/pulse/PulseScreen'

// ─── Страница «Пульс» мастера (DF-07) ────────────────────────────────
// Права дублируют API (-defense in depth): без сессии — на вход
// (layout делает то же), не-мастер — на главную «Требует внимания»
// (его инструмент; Пульс показывает положение всего дела).
export default async function PulsePage() {
  const employee = await getEmployeeByToken((await cookies()).get(SESSION_COOKIE)?.value)
  if (!employee) redirect('/admin/login')
  if (!employee.roles.includes('master')) redirect('/admin')
  return <PulseScreen />
}
