"use client";

/* TU-01.5 — шапка и навигация публичного сайта (референс homedark.png,
   LIGHT REBRANDING V2.0). Логотип — действующее наименование TuLogistica Pro
   (словарь референса; «LOGIX LOGIN»/«Logix Entry» из макета не переносятся).
   Два самостоятельных действия: «Войти в кабинет» и «Запросить расчёт» —
   до TU-03 второе ведёт на CTA-секцию #contact (Д-08, фиктивная форма
   не создаётся). Меню — client-компонент (состояние раскрытия), без новых
   зависимостей. ThemeToggle — публичная навигация (TU-01.3). */

import { useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";

const NAV = [
  { href: "#about", label: "About" },
  { href: "#approach", label: "Approach" },
  { href: "#services", label: "Services" },
  { href: "#workflow", label: "Workflow" },
  { href: "#contact", label: "Contact" },
] as const;

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  return (
    <header className="border-b border-divider bg-surface">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
        <Link
          href="/"
          className="shrink-0 text-base font-bold tracking-wide text-foreground"
        >
          TULOGISTICA<span className="text-accent-text">.PRO</span>
        </Link>
        <nav aria-label="Основная навигация" className="hidden items-center gap-6 lg:flex">
          {NAV.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="text-xs font-medium uppercase tracking-widest text-fg-secondary transition-colors hover:text-foreground"
            >
              {item.label}
            </a>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          {/* TU-01.3: переключатель темы в публичной навигации */}
          <ThemeToggle />
          <Link
            href="/client/login"
            className="hidden text-xs font-medium uppercase tracking-widest text-fg-secondary hover:text-foreground lg:inline"
          >
            Войти в кабинет
          </Link>
          <Button asChild className="hidden text-xs uppercase tracking-widest sm:inline-flex">
            <a href="#contact">Запросить расчёт</a>
          </Button>
          <button
            type="button"
            className="inline-flex size-9 items-center justify-center rounded-sm border border-border text-muted-foreground transition-all outline-none hover:bg-accent hover:text-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] lg:hidden"
            aria-expanded={open}
            aria-controls="site-mobile-nav"
            aria-label={open ? "Закрыть меню" : "Открыть меню"}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X className="size-5" aria-hidden="true" /> : <Menu className="size-5" aria-hidden="true" />}
          </button>
        </div>
      </div>
      {open && (
        <nav
          id="site-mobile-nav"
          aria-label="Мобильная навигация"
          className="border-t border-divider bg-surface px-4 py-3 lg:hidden"
        >
          <ul className="space-y-1">
            {NAV.map((item) => (
              <li key={item.href}>
                <a
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="block rounded-sm px-2 py-2 text-sm text-fg-secondary hover:bg-accent hover:text-foreground"
                >
                  {item.label}
                </a>
              </li>
            ))}
            <li className="border-t border-divider pt-1">
              <Link
                href="/client/login"
                onClick={() => setOpen(false)}
                className="block rounded-sm px-2 py-2 text-sm font-medium text-foreground hover:bg-accent"
              >
                Войти в кабинет
              </Link>
            </li>
          </ul>
        </nav>
      )}
    </header>
  );
}
