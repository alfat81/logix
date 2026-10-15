import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Landmark } from 'lucide-react'
import { getBrokerByToken, BROKER_SESSION_COOKIE } from '@/lib/broker-auth'
import { BrokerLogoutButton } from '@/components/broker/BrokerLogoutButton'

// Защищённая зона портала брокера (route group «(portal)» не влияет
// на URL — зеркало admin/(dashboard), contractor/(portal) и
// client/(portal)): всё под /broker, кроме /broker/login, требует
// живую сессию брокера. Своя проверка и своя кука — не роль
// сотрудника (роадмап, раздел 1).
export default async function BrokerPortalLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const broker = await getBrokerByToken(
    (await cookies()).get(BROKER_SESSION_COOKIE)?.value
  )
  if (!broker) {
    redirect('/broker/login')
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b bg-card">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 font-semibold">
            <span className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Landmark className="size-4" />
            </span>
            <Link href="/broker" className="hover:opacity-80">
              Logix · Брокер
            </Link>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground hidden sm:inline">
              {broker.companyName}
            </span>
            <BrokerLogoutButton />
          </div>
        </div>
      </header>
      <main className="flex-1">
        <div className="max-w-5xl mx-auto px-4 py-6">{children}</div>
      </main>
      <footer className="border-t">
        <div className="max-w-5xl mx-auto px-4 h-12 flex items-center text-sm text-muted-foreground">
          Logix MVP · портал брокера · свои сделки и таможенные платежи
        </div>
      </footer>
    </div>
  )
}
