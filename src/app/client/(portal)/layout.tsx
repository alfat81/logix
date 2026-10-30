import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Container } from 'lucide-react'
import { getClientByToken, CLIENT_SESSION_COOKIE } from '@/lib/client-auth'
import { ClientLogoutButton } from '@/components/client/ClientLogoutButton'

// Защищённая зона клиентского кабинета (route group «(portal)» не
// влияет на URL — зеркало admin/(dashboard) и contractor/(portal)):
// всё под /client, кроме /client/login, требует живую сессию клиента.
// Своя проверка и своя кука — не роль сотрудника (роадмап, раздел 1).
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
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 font-semibold">
            <span className="flex size-7 items-center justify-center rounded-md bg-foreground text-background">
              <Container className="size-4" />
            </span>
            <Link href="/client" className="hover:opacity-80">
              Logix · Кабинет клиента
            </Link>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground hidden sm:inline">
              {client.name}
            </span>
            <ClientLogoutButton />
          </div>
        </div>
      </header>
      <main className="flex-1">
        <div className="max-w-5xl mx-auto px-4 py-6">{children}</div>
      </main>
      <footer className="border-t">
        <div className="max-w-5xl mx-auto px-4 h-12 flex items-center text-sm text-muted-foreground">
          Logix MVP · кабинет клиента · свои запросы и заявки
        </div>
      </footer>
    </div>
  )
}
