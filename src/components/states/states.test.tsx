// @vitest-environment jsdom
/* TU-01.4 — тесты общих компонентов состояний (карточка: «vitest на
   компоненты состояний (обе темы)»). Разметка компонентов не зависит от
   темы (цвета — только классы канонических токенов): проверяем роли
   a11y, тексты, классы токенов и идентичность DOM в обёртках Light и
   Dark; фактические значения контраста обеих тем считает
   scripts/contrast_check.py (IC-17). jsdom/@testing-library — devDep
   только для тестов (runtime-зависимости не добавляются, V-4). */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PackageOpen } from "lucide-react";
import { LoadingState } from "./loading-state";
import { EmptyState } from "./empty-state";
import { ErrorState } from "./error-state";
import { SuccessState } from "./success-state";
import { FieldError } from "./field-error";

function themed(dark: boolean, ui: React.ReactElement) {
  return <div className={dark ? "dark" : undefined}>{ui}</div>;
}

describe("LoadingState", () => {
  it("обе темы: role=status, подпись, спиннер на токенах", () => {
    for (const dark of [false, true]) {
      const { container, unmount } = render(themed(dark, <LoadingState label="Считаем…" />));
      expect(screen.getByRole("status")).toBeTruthy();
      expect(screen.getByText("Считаем…")).toBeTruthy();
      const el = container.querySelector('[role="status"]') as HTMLElement;
      expect(el.className).toContain("text-muted-foreground");
      expect(el.querySelector(".animate-spin")).toBeTruthy();
      expect(container.innerHTML).not.toContain("style=");
      unmount();
    }
  });
});

describe("EmptyState", () => {
  it("обе темы: иконка/заголовок/описание/действие, карточка на токенах", () => {
    for (const dark of [false, true]) {
      const { container, unmount } = render(
        themed(
          dark,
          <EmptyState
            icon={PackageOpen}
            title="Пока ничего нет"
            description="Создайте первый объект."
            action={<button type="button">Создать</button>}
          />
        )
      );
      expect(screen.getByText("Пока ничего нет")).toBeTruthy();
      expect(screen.getByText("Создайте первый объект.")).toBeTruthy();
      expect(screen.getByRole("button", { name: "Создать" })).toBeTruthy();
      const card = container.firstElementChild?.firstElementChild as HTMLElement;
      expect(card.className).toContain("bg-card");
      expect(card.className).toContain("border-border");
      expect(card.querySelector("svg")).toBeTruthy();
      unmount();
    }
  });
});

describe("ErrorState", () => {
  it("обе темы: role=alert, токен destructive", () => {
    for (const dark of [false, true]) {
      const { container, unmount } = render(
        themed(dark, <ErrorState description="Повторите попытку." />)
      );
      expect(screen.getByRole("alert")).toBeTruthy();
      expect(screen.getByText("Что-то пошло не так")).toBeTruthy();
      const alert = container.querySelector('[role="alert"]') as HTMLElement;
      expect(alert.querySelector(".text-danger")).toBeTruthy();
      unmount();
    }
  });
});

describe("SuccessState", () => {
  it("обе темы: role=status, токен success", () => {
    for (const dark of [false, true]) {
      const { container, unmount } = render(
        themed(dark, <SuccessState title="Готово" description="Изменения сохранены." />)
      );
      expect(screen.getByRole("status")).toBeTruthy();
      expect(screen.getByText("Готово")).toBeTruthy();
      const status = container.querySelector('[role="status"]') as HTMLElement;
      expect(status.querySelector(".text-success")).toBeTruthy();
      unmount();
    }
  });
});

describe("FieldError", () => {
  it("обе темы: role=alert + id для aria-describedby; пустое сообщение — null", () => {
    for (const dark of [false, true]) {
      const { container, unmount } = render(themed(dark, <FieldError id="f-err" message="Обязательное поле" />));
      const alert = container.querySelector('[role="alert"]') as HTMLElement;
      expect(alert.id).toBe("f-err");
      expect(alert.className).toContain("text-danger");
      expect(alert.className).toContain("text-xs");
      unmount();
      const empty = render(themed(dark, <FieldError id="x" message="" />));
      expect(empty.container.querySelector('[role="alert"]')).toBeNull();
      empty.unmount();
    }
  });
});
