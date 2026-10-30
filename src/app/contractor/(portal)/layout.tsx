import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Truck } from 'lucide-react'
import { getContractorByToken, CONTRACTOR_SESSION_COOKIE } from '@/lib/contractor-auth'
import { ContractorLogoutButton } from '@/components/contractor/ContractorLogoutButton'

// Защищённая зона портала подрядчика (route group «(portal)» не влияет
// на URL — зеркало admin/(dashboard) из А5): всё под /contractor,
// кроме /contractor/login, требует живую сессию подрядчика. Своя
// проверка и своя кука — не роль сотрудника (роадмап, раздел 1).
export default async function ContractorPortalLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const contractor = await getContractorByToken(
    (await cookies()).get(CONTRACTOR_SESSION_COOKIE)?.value
  )
  if (!contractor) {
    redirect('/contractor/login')
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b bg-card">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 font-semibold">
            <span className="flex size-7 items-center justify-center rounded-md bg-foreground text-background">
              <Truck className="size-4" />
            </span>
            <Link href="/contractor" className="hover:opacity-80">
              Logix · Подрядчик
            </Link>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground hidden sm:inline">
              {contractor.companyName}
            </span>
            <ContractorLogoutButton />
          </div>
        </div>
      </header>
      <main className="flex-1">
        <div className="max-w-5xl mx-auto px-4 py-6">{children}</div>
      </main>
      <footer className="border-t">
        <div className="max-w-5xl mx-auto px-4 h-12 flex items-center text-sm text-muted-foreground">
          Logix MVP · кабинет подрядчика · свои заявки и этапы
        </div>
      </footer>
    </div>
  )
}
