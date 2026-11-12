import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";
import {
  AboutSection,
  AdvantagesSection,
  ApproachSection,
  DigitalSection,
  Eyebrow,
  ServicesSection,
  WorkflowSection,
} from "@/components/site/site-sections";

/* TU-01.5 — главная страница публичного сайта: самостоятельный
   полноценный экран (отличён от страницы Design System), ориентир
   секций — макет homedark.png «главная публичного сайта, тёмная тема»;
   светлая тема — по Executive DS V2.0 / LIGHT REBRANDING V2.0.
   Наименования — словарь LIGHT REBRANDING V2.0: TuLogistica Pro
   («LOGIX LOGIN», «Logix Entry», «Платформа Logix» не переносятся).
   force-dynamic — D31: ссылка подрядчика в футере по рантайм-флагу. */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "TuLogistica Pro — логистика, которая работает на ваш бизнес",
  description:
    "Профессиональная логистика: международные грузоперевозки, логистическое сопровождение, таможенные вопросы и индивидуальные решения. Цифровая платформа TuLogistica Pro.",
};

export default function Home() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main>
        {/* Первый экран */}
        <section className="bg-background">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
            <Eyebrow>Professional logistics ecosystem</Eyebrow>
            <h1 className="mt-6 max-w-4xl text-4xl font-bold uppercase leading-[1.08] tracking-tight text-foreground sm:text-5xl lg:text-6xl">
              Логистика, которая работает на ваш{" "}
              <em className="italic underline decoration-accent-brand decoration-4 underline-offset-8">
                бизнес.
              </em>
            </h1>
            <p className="mt-6 max-w-xl text-base text-fg-secondary">
              TuLogistica объединяет профессиональную экспертизу, управление
              логистическими процессами и цифровые инструменты, чтобы
              превращать сложные задачи перевозки в понятные и управляемые
              решения.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              {/* Д-08: до TU-03 «Запросить расчёт» ведёт на CTA-секцию */}
              <Button asChild className="text-xs uppercase tracking-widest">
                <a href="#contact">Запросить расчёт</a>
              </Button>
              <Button
                asChild
                variant="outline"
                className="text-xs uppercase tracking-widest"
              >
                <a href="#services">Наши решения</a>
              </Button>
            </div>
          </div>
        </section>

        <AboutSection />
        <ApproachSection />
        <ServicesSection />
        <WorkflowSection />
        <DigitalSection />
        <AdvantagesSection />

        {/* CTA (Д-08: фиктивная форма не создаётся — заглушка до TU-03;
            кнопка «Связаться с нами» макета не переносится — Д-16) */}
        <section id="contact" className="scroll-mt-16 bg-accent-strong">
          <div className="mx-auto max-w-6xl px-4 py-20 text-primary-foreground sm:px-6">
            <h2 className="text-center text-4xl font-bold italic uppercase tracking-tight sm:text-5xl">
              Есть логистическая задача?
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-center text-base">
              Расскажите нам о своей задаче. Мы изучим исходные данные и
              поможем определить подходящий вариант дальнейшей работы.
            </p>
            <div className="mx-auto mt-10 max-w-md rounded-lg border border-primary-foreground/30 p-6 text-center">
              <p className="text-sm">
                Онлайн-форма запроса расчёта — в подготовке (этап TU-03).
                Фиктивная форма не создаётся.
              </p>
              <Button
                asChild
                className="mt-5 bg-background text-foreground hover:bg-background/90"
              >
                <Link href="/client/login">Войти в кабинет</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
