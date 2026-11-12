/* TU-01.5 — футер публичного сайта (референс homedark.png, LIGHT
   REBRANDING V2.0). Колонка NETWORK макета не переносится (Д-16):
   реальных каналов/соцсетей нет — фиктивные ссылки запрещены (ссылки
   и CTA ведут только на существующие маршруты и якоря секций).
   Ссылки входов — серверный компонент: ссылка подрядчика по флагу D31
   читается в рантайме (force-dynamic страницы). */

import Link from "next/link";
import { contractorPortalEnabled } from "@/lib/flags";

const PAGE_NAV = [
  { href: "#about", label: "О платформе" },
  { href: "#services", label: "Услуги" },
  { href: "#workflow", label: "Как мы работаем" },
  { href: "#contact", label: "Контакты" },
] as const;

export function SiteFooter() {
  return (
    <footer className="border-t border-divider bg-surface">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <p className="text-base font-bold tracking-wide text-foreground">
              TULOGISTICA<span className="text-accent-text">.PRO</span>
            </p>
            <p className="mt-3 max-w-xs text-sm text-muted-foreground">
              Профессиональная логистическая экспертиза, управление процессами
              и цифровые инструменты.
            </p>
          </div>
          <nav aria-label="Разделы страницы">
            <p className="font-mono text-xs uppercase tracking-widest text-accent-text">
              Navigation
            </p>
            <ul className="mt-3 space-y-2 text-sm">
              {PAGE_NAV.map((item) => (
                <li key={item.href}>
                  <a
                    href={item.href}
                    className="text-fg-secondary transition-colors hover:text-foreground"
                  >
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <nav aria-label="Вход в кабинеты">
            <p className="font-mono text-xs uppercase tracking-widest text-accent-text">
              System
            </p>
            <ul className="mt-3 space-y-2 text-sm">
              <li>
                <Link
                  href="/client/login"
                  className="text-fg-secondary transition-colors hover:text-foreground"
                >
                  Вход для клиентов
                </Link>
              </li>
              <li>
                <Link
                  href="/broker/login"
                  className="text-fg-secondary transition-colors hover:text-foreground"
                >
                  Вход для брокеров
                </Link>
              </li>
              <li>
                <Link
                  href="/admin/login"
                  className="text-fg-secondary transition-colors hover:text-foreground"
                >
                  Вход для сотрудников
                </Link>
              </li>
              {/* D31: кабинет подрядчика заморожен — ссылка только при
                  явном включении CONTRACTOR_PORTAL_ENABLED (рантайм) */}
              {contractorPortalEnabled() && (
                <li>
                  <Link
                    href="/contractor/login"
                    className="text-fg-secondary transition-colors hover:text-foreground"
                  >
                    Вход для подрядчиков
                  </Link>
                </li>
              )}
            </ul>
          </nav>
        </div>
        <div className="mt-10 flex flex-col gap-2 border-t border-divider pt-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} TULOGISTICA // PROFESSIONAL LOGISTICS</p>
          <p className="font-mono uppercase tracking-widest text-accent-text">
            The evolution of logistic logic.
          </p>
        </div>
      </div>
    </footer>
  );
}
