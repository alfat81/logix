import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getClientByToken, CLIENT_SESSION_COOKIE } from '@/lib/client-auth'
import { ClientLogoutButton } from '@/components/client/ClientLogoutButton'
import { ClientNav } from '@/components/client/ClientNav'
import { ClientNewRequestButton } from '@/components/client/ClientNewRequestButton'
import { ThemeToggle } from '@/components/theme-toggle'

// Защищённая зона клиентского кабинета (route group «(portal)» не
// влияет на URL — зеркало admin/(dashboard) и contractor/(portal)):
// всё под /client, кроме /client/login, требует живую сессию клиента.
// Своя проверка и своя кука — не роль сотрудника (роадмап, раздел 1).
//
// TU-01.7 (волна 3): топбар по референсу clientcabinet.png — знак
// «Dynamic T» + TULOGISTICA (LIGHT REBRANDING V2.0, как в админке),
// навигация разделов, кнопка «Новый запрос», компания и пользователь.
export default async function ClientPortalLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const client = await getClientByToken(
    (await cookies()).get(CLIENT_SESSION_COOKIE)?.value
  )
  if (!client) {
    redirect('/client/login')
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b bg-card">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-6">
          <div className="flex items-center gap-2 shrink-0">
            {/* Знак «Dynamic T» (LIGHT REBRANDING V2.0) */}
            <span
              aria-hidden="true"
              className="flex size-7 items-center justify-center rounded-md bg-accent-strong font-bold text-accent-strong-fg"
            >
              T
            </span>
            <Link href="/client" className="font-semibold tracking-wide hover:opacity-80">
              TULOGISTICA
            </Link>
          </div>
          <ClientNav />
          <div className="ml-auto flex items-center gap-3 shrink-0">
            <ClientNewRequestButton />
            <div className="hidden lg:block text-right leading-tight">
              <div className="text-sm font-medium truncate max-w-48">{client.name}</div>
              <div className="text-xs text-muted-foreground">{client.userName}</div>
            </div>
            {/* TU-01.3: переключатель темы — в шапке кабинета */}
            <ThemeToggle />
            <ClientLogoutButton />
          </div>
        </div>
      </header>
      <main className="flex-1">
        <div className="max-w-6xl mx-auto px-4 py-8">{children}</div>
      </main>
      <footer className="border-t">
        <div className="max-w-6xl mx-auto px-4 h-12 flex items-center text-sm text-muted-foreground justify-between">
          <span>© {new Date().getFullYear()} TULOGISTICA.PRO</span>
          <span>Кабинет клиента · свои запросы и заявки</span>
        </div>
      </footer>
    </div>
  )
}
