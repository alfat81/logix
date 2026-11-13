// @vitest-environment jsdom
/* TU-01.8 — тесты сводных карточек брокера (карточка: «смоук × 2 темы»
   → unit-уровень обеих тем по образцу states.test.tsx). Разметка не
   зависит от темы (цвета — только классы канонических токенов):
   проверяем тексты, значения, классы токенов и отсутствие inline-стилей
   в обёртках Light и Dark; фактический контраст считает
   scripts/contrast_check.py (IC-17). */
import { describe, expect, it, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { BrokerSummaryCards } from "./BrokerSummaryCards";
import type { BrokerQueueCounters } from "./queue";

const EMPTY: BrokerQueueCounters = { awaiting: 0, inWork: 0, completed: 0 };

// globals: false — auto-cleanup testing-library не регистрируется сам
afterEach(cleanup);

function themed(dark: boolean, ui: React.ReactElement) {
  return <div className={dark ? "dark" : undefined}>{ui}</div>;
}

describe("BrokerSummaryCards", () => {
  it("обе темы: подписи, значения на токенах, без inline-стилей", () => {
    for (const dark of [false, true]) {
      const { container, unmount } = render(
        themed(
          dark,
          <BrokerSummaryCards
            loading={false}
            counters={{ awaiting: 3, inWork: 2, completed: 14 }}
          />
        )
      );
      expect(screen.getByText("Ожидают расчёта")).toBeTruthy();
      expect(screen.getByText("В работе")).toBeTruthy();
      expect(screen.getByText("Завершено")).toBeTruthy();
      const values = [...container.querySelectorAll(".text-4xl")];
      expect(values.map((v) => v.textContent)).toEqual(["3", "2", "14"]);
      // Акцент — только на «Ожидают расчёта» (первая карточка)
      expect(
        values.filter((v) => v.classList.contains("text-accent-text")).map((v) => v.textContent)
      ).toEqual(["3"]);
      expect(container.innerHTML).not.toContain("style=");
      expect(container.querySelectorAll(".bg-card").length).toBe(3);
      unmount();
    }
  });

  it("загрузка: плейсхолдеры вместо значений, счётчики не показываются", () => {
    const { container, unmount } = render(themed(false, <BrokerSummaryCards loading counters={EMPTY} />));
    expect(screen.getByText("Ожидают расчёта")).toBeTruthy();
    expect(container.textContent).not.toContain("0");
    expect(container.innerHTML).not.toContain("style=");
    unmount();
  });
});
