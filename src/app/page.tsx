import Link from "next/link";
import { ArrowRight, Container, Ship, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { contractorPortalEnabled } from "@/lib/flags";

// Корневая страница — минимальный фейс проекта. Куда grows: лендинг
// с описанием сервиса (когда дойдёт очередь), сюда пока
// приходит и проверяющий превью, и первый менеджер Logix.
export default function Home() {
  return (
    <main className="min-h-screen flex flex-col">
      <header className="border-b">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 font-semibold text-lg">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Container className="size-5" />
            </span>
            Logix
          </div>
          <div className="flex items-center gap-2">
            {/* D31 (DF-00C): кабинет подрядчика заморожен — ссылка только
                при явном включении CONTRACTOR_PORTAL_ENABLED=true */}
            {contractorPortalEnabled() && (
              <Button asChild variant="ghost" size="sm">
                <Link href="/contractor/login">Вход для подрядчиков</Link>
              </Button>
            )}
            <Button asChild variant="ghost" size="sm">
              <Link href="/broker/login">Вход для брокеров</Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link href="/client/login">Вход для клиентов</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/admin">Вход для сотрудников</Link>
            </Button>
          </div>
        </div>
      </header>

      <section className="flex-1 flex items-center">
        <div className="max-w-5xl mx-auto px-4 py-16 grid gap-10 md:grid-cols-2 md:items-center">
          <div className="grid gap-5">
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-balance">
              Мультимодальная логистика под контролем
            </h1>
            <p className="text-lg text-muted-foreground">
              Заявки, этапы перевозки и статусы — в одной системе: от забора
              груза и экспортного оформления до доставки получателю.
            </p>
            <div className="flex gap-3">
              <Button asChild size="lg">
                <Link href="/admin">
                  Войти в систему
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
            </div>
          </div>
          <div className="hidden md:grid gap-4">
            <div className="rounded-lg border bg-card p-5 flex items-start gap-4">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                <Truck className="size-5" />
              </span>
              <div>
                <div className="font-medium">Обязательное ядро этапов</div>
                <p className="text-sm text-muted-foreground">
                  Шесть этапов перевозки подставляются в заявку автоматически
                  и не могут быть удалены.
                </p>
              </div>
            </div>
            <div className="rounded-lg border bg-card p-5 flex items-start gap-4">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                <Ship className="size-5" />
              </span>
              <div>
                <div className="font-medium">Надстройка под маршрут</div>
                <p className="text-sm text-muted-foreground">
                  Менеджер добавляет необязательные этапы из каталога — под
                  специфику конкретной перевозки.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between text-sm text-muted-foreground">
          <span>Logix — платформа мультимодальной логистики</span>
          <span>MVP</span>
        </div>
      </footer>
    </main>
  );
}
