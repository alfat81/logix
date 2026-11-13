import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getBrokerByToken, BROKER_SESSION_COOKIE } from '@/lib/broker-auth'
import { BrokerLogoutButton } from '@/components/broker/BrokerLogoutButton'
import { ThemeToggle } from '@/components/theme-toggle'

// Защищённая зона портала брокера (route group «(portal)» не влияет
// на URL — зеркало admin/(dashboard), contractor/(portal) и
// client/(portal)): всё под /broker, кроме /broker/login, требует
// живую сессию брокера. Своя проверка и своя кука — не роль
// сотрудника (роадмап, раздел 1).
//
// TU-01.8 (волна 4): брендинг по референсу brockercabinet.png и
// LIGHT REBRANDING V2.0 — знак «Dynamic T» + TULOGISTICA (как в
// кабинетах клиента и менеджера, Д-14/Д-22: каркас — топбар, красный
// сигнал в логотипе/навигации запрещён — IC-17, LOGO_NAV_FILES).
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
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 shrink-0">
            {/* Знак «Dynamic T» (LIGHT REBRANDING V2.0) */}
            <span
              aria-hidden="true"
              className="flex size-7 items-center justify-center rounded-md bg-accent-strong font-bold text-accent-strong-fg"
            >
              T
            </span>
            <Link href="/broker" className="font-semibold tracking-wide hover:opacity-80">
              TULOGISTICA
            </Link>
            <span className="text-sm text-muted-foreground hidden sm:inline">· брокер</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground hidden sm:inline">
              {broker.companyName}
            </span>
            {/* TU-01.3: переключатель темы — в шапке кабинета */}
            <ThemeToggle />
            <BrokerLogoutButton />
          </div>
        </div>
      </header>
      <main className="flex-1">
        <div className="max-w-6xl mx-auto px-4 py-8">{children}</div>
      </main>
      <footer className="border-t">
        <div className="max-w-6xl mx-auto px-4 h-12 flex items-center text-sm text-muted-foreground justify-between">
          <span>© {new Date().getFullYear()} TULOGISTICA.PRO</span>
          <span>Портал брокера · свои сделки и таможенные расчёты</span>
        </div>
      </footer>
    </div>
  )
}
