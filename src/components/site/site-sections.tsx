/* TU-01.5 — секции главной публичного сайта (референс homedark.png).
   Вынесены из src/app/page.tsx (лимит размера файла — IC-09/RULES 2.14);
   шапка — site-header.tsx, футер — site-footer.tsx, hero и CTA — в
   самой странице. Цвета — только канонические токены (обе темы). */

import Link from "next/link";
import {
  Globe,
  Landmark,
  ShieldCheck,
  SlidersHorizontal,
  Truck,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const APPROACH = [
  {
    num: "01",
    title: "Анализ задачи",
    text: "Изучаем потребности клиента, параметры груза, маршрут и уровень перевозки.",
  },
  {
    num: "02",
    title: "Подбор решения",
    text: "Рассматриваем доступные варианты организации перевозки и подбираем подходящие формы решения.",
  },
  {
    num: "03",
    title: "Профессиональная координация",
    text: "Координируем необходимые процессы и взаимодействие участников логистической цепочки.",
  },
  {
    num: "04",
    title: "Контроль процесса",
    text: "Сопровождаем выполнение согласованных условий и обеспечиваем информационную прозрачность взаимодействия.",
  },
] as const;

const SERVICES = [
  { icon: Globe, title: "Международная логистика" },
  { icon: Truck, title: "Организация грузоперевозок" },
  { icon: ShieldCheck, title: "Логистическое сопровождение" },
  { icon: Landmark, title: "Таможенные вопросы и расчёты" },
  { icon: SlidersHorizontal, title: "Индивидуальные логистические решения" },
] as const;

const WORKFLOW = [
  { num: "01", title: "Запрос", text: "Вы описываете груз, маршрут и задачи перевозки." },
  { num: "02", title: "Анализ", text: "Мы изучаем исходные данные и уточняем детали." },
  { num: "03", title: "Предложение", text: "Готовим вариант перевозки по согласованным условиям." },
  { num: "04", title: "Организация", text: "Организуем выполнение и взаимодействие участников." },
  { num: "05", title: "Сопровождение", text: "Координируем решение в рамках согласованных условий." },
] as const;

const ADVANTAGES = [
  {
    title: "Профессиональный подход",
    text: "Внимание к деталям и понимание логистических процессов.",
  },
  {
    title: "Системное управление",
    text: "Последовательная работа с задачами и условиями перевозки.",
  },
  {
    title: "Прозрачное взаимодействие",
    text: "Понятные этапы согласования и коммуникации.",
  },
  {
    title: "Цифровая среда",
    text: "Развитие инструментов для удобного взаимодействия с клиентами.",
  },
] as const;

export function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent-text">
      {children}
    </p>
  );
}

/* О компании — показатель эффективности (демо-метрика помечена). */
export function AboutSection() {
  return (
    <section id="about" className="scroll-mt-16 bg-surface">
      <div className="mx-auto grid max-w-6xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[1.2fr_1fr] lg:items-center">
        <div>
          <Eyebrow>Who we are</Eyebrow>
          <h2 className="mt-4 text-3xl font-semibold italic uppercase tracking-tight text-foreground sm:text-4xl">
            Логистика — это больше, чем перевозка.
          </h2>
          <p className="mt-6 max-w-xl text-base text-fg-secondary">
            Современная логистика требует не только организации перевозки
            груза. Она требует понимания процессов, внимания к деталям и
            согласованных действий всех участников.
          </p>
          <p className="mt-4 max-w-xl text-base text-fg-secondary">
            TuLogistica развивает профессиональный подход к управлению
            логистическими задачами: от понимания потребности клиента до
            организации перевозки и сопровождения процесса. Мы стремимся
            сделать сложную логистику более прозрачной, последовательной и
            управляемой.
          </p>
        </div>
        <div className="rounded-xl bg-card p-6 sm:p-8">
          <p className="text-5xl font-bold text-accent-text">66%</p>
          <div aria-hidden="true" className="mt-6 h-40 rounded-lg bg-surface-secondary" />
          <p className="mt-6 text-xs font-semibold uppercase tracking-widest text-foreground">
            Focus on efficiency
          </p>
          <div className="mt-3 h-1.5 rounded-full bg-surface-secondary">
            <div className="h-1.5 w-2/3 rounded-full bg-accent-brand" />
          </div>
          {/* Демонстрационная метрика макета — маркирована (правило
              «демо-данные помечаются») */}
          <p className="mt-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">
            Demo sample
          </p>
        </div>
      </div>
    </section>
  );
}

/* Методология — 4 шага. */
export function ApproachSection() {
  return (
    <section id="approach" className="scroll-mt-16 bg-background">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="text-center">
          <Eyebrow>Our approach</Eyebrow>
          <h2 className="mt-4 text-3xl font-semibold italic uppercase tracking-tight text-foreground sm:text-4xl">
            Системность в каждом решении.
          </h2>
        </div>
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {APPROACH.map((step) => (
            <div key={step.num} className="rounded-lg border border-border p-6">
              <p className="font-mono text-xl text-accent-text">{step.num}</p>
              <h3 className="mt-4 text-sm font-semibold uppercase tracking-wide text-foreground">
                {step.title}
              </h3>
              <p className="mt-3 text-sm text-muted-foreground">{step.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* Услуги — 5 направлений. */
export function ServicesSection() {
  return (
    <section id="services" className="scroll-mt-16 bg-surface">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div>
            <Eyebrow>What we do</Eyebrow>
            <h2 className="mt-4 max-w-xl text-3xl font-semibold italic uppercase tracking-tight text-foreground sm:text-4xl">
              Логистические решения под задачу.
            </h2>
          </div>
          <a
            href="#contact"
            className="shrink-0 text-xs font-semibold uppercase tracking-widest text-accent-text underline decoration-2 underline-offset-4 hover:text-foreground"
          >
            Обсудить логистическую задачу
          </a>
        </div>
        <p className="mt-6 max-w-2xl text-base text-fg-secondary">
          Каждая перевозка начинается с понимания задач. Мы рассматриваем
          параметры груза, маршрут, сроки и специальные условия, чтобы
          определить подходящий вариант организации логистики.
        </p>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SERVICES.map(({ icon: Icon, title }) => (
            <div key={title} className="rounded-lg bg-card p-6">
              <Icon aria-hidden="true" className="size-6 text-accent-brand" />
              <h3 className="mt-4 text-sm font-semibold uppercase tracking-wide text-foreground">
                {title}
              </h3>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* Workflow — 5 шагов. */
export function WorkflowSection() {
  return (
    <section id="workflow" className="scroll-mt-16 bg-background">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="text-center">
          <Eyebrow>How it works</Eyebrow>
          <h2 className="mt-4 text-3xl font-semibold italic uppercase tracking-tight text-foreground sm:text-4xl">
            От запроса до результата.
          </h2>
        </div>
        <div className="relative mt-12">
          {/* соединительная линия — только на desktop, декоративная */}
          <div
            aria-hidden="true"
            className="absolute left-0 right-0 top-6 hidden h-px bg-border md:block"
          />
          <ol className="grid gap-8 md:grid-cols-5">
            {WORKFLOW.map((step) => (
              <li key={step.num} className="relative text-center">
                <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary font-mono text-sm text-primary-foreground">
                  {step.num}
                </span>
                <h3 className="mt-4 text-sm font-semibold uppercase tracking-wide text-foreground">
                  {step.title}
                </h3>
                <p className="mt-2 text-sm text-muted-foreground">{step.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

/* Цифровая логистика — превью платформы (декоративный скелет,
   без вымышленных данных). */
export function DigitalSection() {
  return (
    <section className="bg-surface">
      <div className="mx-auto grid max-w-6xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:items-center">
        <div aria-hidden="true" className="rounded-xl border border-border bg-card p-4 sm:p-6">
          <div className="flex items-center justify-between border-b border-divider pb-3">
            <p className="font-mono text-xs uppercase tracking-widest text-fg-secondary">
              Command Center // Manager view
            </p>
            <span className="size-2 rounded-full bg-success" />
          </div>
          <div className="mt-5 space-y-3">
            <div className="h-10 rounded-md bg-surface-secondary" />
            <div className="h-10 rounded-md bg-surface-secondary" />
            <div className="h-10 rounded-md bg-surface-secondary" />
            <div className="h-14 w-44 rounded-md bg-accent-strong" />
          </div>
        </div>
        <div>
          <Eyebrow>Digital logistics</Eyebrow>
          <h2 className="mt-4 text-3xl font-semibold italic uppercase tracking-tight text-foreground sm:text-4xl">
            Профессиональная логистика. Цифровой подход.
          </h2>
          <p className="mt-6 max-w-xl text-base text-fg-secondary">
            TuLogistica развивает цифровую среду для взаимодействия и
            управления логистическими процессами. Платформа TuLogistica Pro
            предлагает единую структурированную работу с заявками,
            предложениями и заказами.
          </p>
          <Button
            asChild
            variant="outline"
            className="mt-8 text-xs uppercase tracking-widest"
          >
            <Link href="/client/login">Войти в личный кабинет</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

/* Преимущества. */
export function AdvantagesSection() {
  return (
    <section className="bg-background">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="text-center">
          <Eyebrow>Why TuLogistica</Eyebrow>
          <h2 className="mt-4 text-3xl font-semibold italic uppercase tracking-tight text-foreground sm:text-4xl">
            Логика, которая стоит за каждым решением.
          </h2>
        </div>
        <div className="mt-12 grid gap-4 sm:grid-cols-2">
          {ADVANTAGES.map((item) => (
            <div key={item.title} className="rounded-lg bg-card p-6 sm:p-8">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-foreground">
                {item.title}
              </h3>
              <p className="mt-3 text-sm text-muted-foreground">{item.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
