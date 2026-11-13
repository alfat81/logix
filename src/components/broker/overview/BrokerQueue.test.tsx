// @vitest-environment jsdom
/* TU-01.8 — тесты очереди расчётов брокера: обе темы (токены, без
   inline-стилей), вкладки «Активные / Архив», поиск, действия
   «Открыть / Рассчитать», пустые состояния. Таблица (десктоп) и
   карточки (мобильная ширина) рендерятся вместе — в jsdom проверяем
   содержимое через таблицу и getAllBy*. */
import { describe, expect, it, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { BrokerQueue } from "./BrokerQueue";
import { buildQueue, type BrokerLeadRow, type BrokerOrderRow } from "./queue";

// globals: false — auto-cleanup testing-library не регистрируется сам
afterEach(cleanup);

const order = (over: Partial<BrokerOrderRow>): BrokerOrderRow => ({
  id: "o1",
  number: "17-1",
  status: "in_progress",
  createdAt: "2026-11-10T10:00:00.000Z",
  cargoInfo: { cargoName: "Станки", hsCode: "8471300000" },
  customerName: "ООО «ПромТех»",
  estimate: { customsDutyEstimate: 42800 },
  ...over,
});

const lead = (over: Partial<BrokerLeadRow>): BrokerLeadRow => ({
  id: "l1",
  status: "new",
  createdAt: "2026-11-12T09:00:00.000Z",
  cargoInfo: { cargoName: "Ткани", hsCode: "6204321000" },
  customerName: "ИП Волков",
  estimate: null,
  ...over,
});

const ROWS = buildQueue(
  [order({}), order({ id: "o2", number: "16-3", status: "completed", cargoInfo: {} })],
  [lead({})]
);

function themed(dark: boolean, ui: React.ReactElement) {
  return <div className={dark ? "dark" : undefined}>{ui}</div>;
}

describe("BrokerQueue", () => {
  it("обе темы: таблица с колонками референса, строки на токенах, без inline-стилей", () => {
    for (const dark of [false, true]) {
      const { container, unmount } = render(themed(dark, <BrokerQueue loading={false} rows={ROWS} />));
      for (const h of ["Сделка", "Контрагент", "ТН ВЭД", "Платежи (оценка)", "Статус", "Действие"]) {
        expect(screen.getByText(h)).toBeTruthy();
      }
      const body = container.querySelector("tbody")!;
      // Запросы перед заявками (buildQueue); архивная заявка скрыта на «Активных»
      expect(body.querySelectorAll("tr").length).toBe(2);
      expect(body.textContent).toContain("17-1");
      expect(body.textContent).toContain("8471300000");
      expect(body.textContent).toContain("ООО «ПромТех»");
      expect(body.textContent).not.toContain("16-3");
      expect(container.innerHTML).not.toContain("style=");
      unmount();
    }
  });

  it("действия: «Рассчитать» — запрос без оценки, «Открыть» — заявка; ссылки в карточки", () => {
    const { container, unmount } = render(themed(false, <BrokerQueue loading={false} rows={ROWS} />));
    const calc = screen.getAllByRole("link", { name: /Рассчитать запрос/ });
    expect(calc.length).toBeGreaterThanOrEqual(1);
    expect(calc[0].getAttribute("href")).toBe("/broker/leads/l1");
    const open = screen.getAllByRole("link", { name: "Открыть заявку 17-1" });
    expect(open.length).toBeGreaterThanOrEqual(1);
    expect(open[0].getAttribute("href")).toBe("/broker/orders/o1");
    // У запроса номера нет — бейдж «Запрос · дата» вместо номера (И1)
    expect(container.querySelector("tbody")!.textContent).toContain("Запрос ·");
    unmount();
  });

  it("вкладка «Архив»: завершённые заявки, активные скрыты", () => {
    const { container, unmount } = render(themed(false, <BrokerQueue loading={false} rows={ROWS} />));
    fireEvent.click(screen.getByRole("button", { name: "Архив" }));
    const body = container.querySelector("tbody")!;
    expect(body.textContent).toContain("16-3");
    expect(body.textContent).not.toContain("17-1");
    expect(screen.getAllByRole("link", { name: "Открыть заявку 16-3" }).length).toBeGreaterThanOrEqual(1);
    unmount();
  });

  it("поиск фильтрует очередь; без совпадений — состояние «Ничего не найдено»", () => {
    const { container, unmount } = render(themed(false, <BrokerQueue loading={false} rows={ROWS} />));
    const input = screen.getByLabelText(/Поиск по номеру/);
    fireEvent.change(input, { target: { value: "волков" } });
    expect(container.querySelector("tbody")!.textContent).toContain("Запрос ·");
    expect(container.querySelector("tbody")!.textContent).not.toContain("17-1");
    fireEvent.change(input, { target: { value: "витрина" } });
    expect(screen.getByText("Ничего не найдено")).toBeTruthy();
    expect(container.querySelector("tbody")).toBeNull();
    unmount();
  });

  it("пустая активная очередь — EmptyState, загрузка — LoadingState", () => {
    const { unmount: u1 } = render(themed(false, <BrokerQueue loading={false} rows={[]} />));
    expect(screen.getByText("Очередь пуста")).toBeTruthy();
    u1();
    const { unmount: u2 } = render(themed(false, <BrokerQueue loading rows={[]} />));
    expect(screen.getByText("Загрузка расчётов…")).toBeTruthy();
    u2();
  });
});
