import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ThemeToggle } from "@/components/theme-toggle";
import { LoadingState } from "@/components/states/loading-state";
import { EmptyState } from "@/components/states/empty-state";
import { ErrorState } from "@/components/states/error-state";
import { SuccessState } from "@/components/states/success-state";
import { FieldError } from "@/components/states/field-error";

/* TU-01.2 — каталог Design System (принят TU-G1, решение A-3).
   Служебная страница: реальный рендер токенов и компонентов в ОБОИХ
   темах (замечание 5 владельца: rg-аудит не заменяет визуальную
   проверку). Индексация запрещена (robots.ts разрешает только '/'). */

export const metadata: Metadata = {
  title: "Logix — каталог Design System (TU-01.2)",
  robots: { index: false, follow: false },
};

/* Канонические 17 токенов (поручение TU-01, роадмап 1.36 §7) —
   имена; значения берутся из globals.css через var() и меняются
   вместе с темой. */
const CANONICAL: Array<[string, string]> = [
  ["background", "--c-background"],
  ["surface", "--c-surface"],
  ["surface-secondary", "--c-surface-secondary"],
  ["text-primary", "--c-text"],
  ["text-secondary", "--c-text-secondary"],
  ["text-muted", "--c-text-muted"],
  ["border", "--c-border"],
  ["divider", "--c-divider"],
  ["accent", "--c-accent"],
  ["accent-hover", "--c-accent-hover"],
  ["accent-pressed", "--c-accent-pressed"],
  ["success", "--c-success"],
  ["warning", "--c-warning"],
  ["danger", "--c-danger"],
  ["info", "--c-info"],
  ["focus", "--c-focus"],
  ["disabled", "--c-disabled"],
];

const EXTRA: Array<[string, string]> = [
  ["accent-strong (заливка кнопок)", "--c-accent-strong"],
  ["accent-tint (наведение)", "--c-accent-tint"],
  ["accent-strong-fg", "--c-accent-strong-fg"],
  ["disabled-fg", "--c-disabled-fg"],
];

function Swatch({ name, token }: { name: string; token: string }) {
  return (
    <div className="flex items-center gap-2 rounded-md border p-2" style={{ background: "var(--c-surface)" }}>
      <span
        aria-hidden="true"
        className="size-8 shrink-0 rounded border"
        style={{ background: `var(${token})`, borderColor: "var(--c-border)" }}
      />
      <div className="min-w-0">
        <div className="truncate text-xs font-medium">{name}</div>
        <div className="truncate font-mono text-xs" style={{ color: "var(--c-text-muted)" }}>
          {token}
        </div>
      </div>
    </div>
  );
}

export default function DesignSystemPage() {
  return (
    <main className="mx-auto max-w-5xl space-y-10 p-6" style={{ background: "var(--c-background)" }}>
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Каталог Design System — TU-01.2</h1>
          <p className="mt-1 text-sm" style={{ color: "var(--c-text-secondary)" }}>
            Принят на TU-G1 (решение A-3, D81). Токены обеих тем, типографика, компоненты и интерактивные
            состояния. Переключатель ниже меняет Light / Dark / System (первый вход — System).
          </p>
        </div>
        {/* TU-01.3: базовые стили кнопки внутри компонента */}
        <ThemeToggle />
      </header>

      <section aria-labelledby="palette-title" className="space-y-3">
        <h2 id="palette-title" className="text-lg font-semibold">
          1. Семантические токены — 17 канонических (+ пары кнопок/состояний)
        </h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {CANONICAL.map(([name, token]) => (
            <Swatch key={token} name={name} token={token} />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {EXTRA.map(([name, token]) => (
            <Swatch key={token} name={name} token={token} />
          ))}
        </div>
      </section>

      <section aria-labelledby="type-title" className="space-y-3">
        <h2 id="type-title" className="text-lg font-semibold">
          2. Типографика — IBM Plex Sans (400/500/600/700) и IBM Plex Mono (400/500/600)
        </h2>
        <div className="space-y-1">
          <p className="text-2xl font-bold">Bold 700 — заголовки карточек</p>
          <p className="text-xl font-semibold">Semibold 600 — подзаголовки</p>
          <p className="text-base font-medium">Medium 500 — акцентные подписи</p>
          <p className="text-base font-normal">Regular 400 — основной текст интерфейса</p>
          <p className="font-mono text-base">
            Mono: DF-2026-0001 · INVOICE 0042-77 · 1 250 000,00 ₽ · № плацкарта
          </p>
          <p className="font-mono text-sm" style={{ color: "var(--c-text-muted)" }}>
            Mono 12px — идентификаторы, номера, финансовые данные, табличные показатели
          </p>
        </div>
      </section>

      <section aria-labelledby="buttons-title" className="space-y-3">
        <h2 id="buttons-title" className="text-lg font-semibold">
          3. Кнопки и интерактивные состояния
        </h2>
        <p className="text-sm" style={{ color: "var(--c-text-secondary)" }}>
          Заливка основных/критичных кнопок — accent-strong (белый текст ≥ 4,5:1). Наведение /
          нажатие / недоступность — токены accent-hover, accent-pressed, disabled. Проверка
          клавиатуры: Tab переводит фокус на кнопку (кольцо — токен focus, ≥ 3:1 к фону).
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Button>Основное действие</Button>
          <Button variant="secondary">Вторичное</Button>
          <Button variant="destructive">Критичное</Button>
          <Button variant="outline">На рамке</Button>
          <Button disabled>Недоступная</Button>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <a href="#buttons-title" className="underline" style={{ color: "var(--c-accent)" }}>
            Ссылка-акцент (Terracotta)
          </a>
          <span style={{ color: "var(--c-danger)" }}>Текст сигнала danger</span>
          <span style={{ color: "var(--c-success)" }}>Текст сигнала успеха</span>
        </div>
      </section>

      <section aria-labelledby="badges-title" className="space-y-3">
        <h2 id="badges-title" className="text-lg font-semibold">
          4. Статусные бейджи §3.2 (обе темы — точка 8px, текст читаемый)
        </h2>
        <div className="flex flex-wrap gap-2">
          <Badge variant="transit">В пути</Badge>
          <Badge variant="delay">Задержка</Badge>
          <Badge variant="delivered">Доставлено</Badge>
          <Badge variant="pending">Ожидание</Badge>
          <Badge variant="review">На проверке</Badge>
          <Badge variant="version">V-бейдж</Badge>
          <Badge variant="critical">Критичный</Badge>
        </div>
      </section>

      <section aria-labelledby="forms-title" className="space-y-3">
        <h2 id="forms-title" className="text-lg font-semibold">
          5. Поверхности, формы, фокус
        </h2>
        <Card>
          <CardHeader>
            <CardTitle>Карточка на поверхности (surface)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-2">
              <Label htmlFor="ds-demo-input">Поле ввода (границы — референс: Border-Sand / Slate; фокус-кольцо ≥3:1 — WCAG 2.4.7)</Label>
              <Input id="ds-demo-input" placeholder="Номер заявки — вкладывается Mono" />
              <Input disabled placeholder="Недоступное поле (disabled)" />
            </div>
            <p className="text-sm" style={{ color: "var(--c-text-muted)" }}>
              Приглушённая подпись на поверхности: текст-muted ≥ 4,5:1 в обеих темах (IC-17).
            </p>
          </CardContent>
        </Card>
      </section>

      {/* TU-01.4: общие компоненты состояний (каталог §4, обе темы). */}
      <section aria-labelledby="states-title" className="space-y-3">
        <h2 id="states-title" className="text-lg font-semibold">
          6. Состояния — loading / empty / error / success / validation (TU-01.4)
        </h2>
        <div className="grid gap-3 md:grid-cols-2">
          <LoadingState label="Загрузка данных…" className="rounded-lg border border-border bg-card" />
          <ErrorState description="Не удалось загрузить данные. Повторите попытку." />
          <EmptyState title="Пока ничего нет" description="Здесь появятся объекты после создания." />
          <SuccessState title="Изменения сохранены" description="Данные актуальны." />
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <Label htmlFor="ds-state-input">Поле с ошибкой заполнения</Label>
          <Input id="ds-state-input" className="mt-2" aria-invalid="true" aria-describedby="ds-state-error" defaultValue="17-0" />
          <FieldError id="ds-state-error" message="Номер заявки не может начинаться с нуля" />
        </div>
      </section>

      <footer className="text-xs" style={{ color: "var(--c-text-muted)" }}>
        Источник значений — src/app/globals.css (единственный файл hex, RULES 2.14). Прослеживаемость
        «токен → значение → элемент референса» и реестр отклонений — docs/design/catalog/README.md и
        BRANDBOOK v2.0 (утверждён, TU-G1).
      </footer>
    </main>
  );
}
