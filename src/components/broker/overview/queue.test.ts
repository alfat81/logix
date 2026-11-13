/* TU-01.8 — тесты чистой логики очереди брокера (обе темы проверяют
   компонентные тесты, здесь — правила сборки/фильтрации/счётчиков).
   Данные — фикстуры в формате ответов /api/broker/orders|leads. */
import { describe, expect, it } from "vitest";
import {
  buildQueue,
  filterQueue,
  queueCounters,
  type BrokerLeadRow,
  type BrokerOrderRow,
} from "./queue";

const order = (over: Partial<BrokerOrderRow>): BrokerOrderRow => ({
  id: "o1",
  number: "17-1",
  status: "in_progress",
  createdAt: "2026-11-10T10:00:00.000Z",
  cargoInfo: { cargoName: "Станки", hsCode: "8471300000" },
  originCity: "Москва",
  destinationCity: "Шанхай",
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

describe("buildQueue", () => {
  it("запросы идут перед заявками, внутри групп — новые сверху", () => {
    const rows = buildQueue(
      [order({ id: "o1", createdAt: "2026-11-01T00:00:00.000Z" }), order({ id: "o2", createdAt: "2026-11-10T00:00:00.000Z" })],
      [lead({ id: "l1", createdAt: "2026-11-05T00:00:00.000Z" }), lead({ id: "l2", createdAt: "2026-11-12T00:00:00.000Z" })]
    );
    expect(rows.map((r) => r.key)).toEqual([
      "lead:l2",
      "lead:l1",
      "order:o2",
      "order:o1",
    ]);
  });

  it("у заявки есть номер, у запроса — нет (И1); оценка платежей из estimate", () => {
    const rows = buildQueue([order({})], [lead({ estimate: { customsDutyEstimate: 8150 } })]);
    const o = rows.find((r) => r.kind === "order")!;
    const l = rows.find((r) => r.kind === "lead")!;
    expect(o.number).toBe("17-1");
    expect(l.number).toBeNull();
    expect(o.payments).toBeTruthy();
    expect(l.payments).toBeTruthy();
    expect(o.hsCode).toBe("8471300000");
    expect(o.routeFrom).toBe("Москва");
    expect(o.routeTo).toBe("Шанхай");
  });

  it("awaitingEstimate — запрос без оценки (кроме отказа); у заявки всегда false", () => {
    const rows = buildQueue(
      [order({})],
      [lead({}), lead({ id: "l2", estimate: { customsDutyEstimate: 1 } }), lead({ id: "l3", status: "lost" })]
    );
    expect(rows.find((r) => r.key === "lead:l1")!.awaitingEstimate).toBe(true);
    expect(rows.find((r) => r.key === "lead:l2")!.awaitingEstimate).toBe(false);
    expect(rows.find((r) => r.key === "lead:l3")!.awaitingEstimate).toBe(false);
    expect(rows.find((r) => r.kind === "order")!.awaitingEstimate).toBe(false);
  });

  it("архив: completed/cancelled заявки и отказы; активные остаются на вкладке «Активные»", () => {
    const rows = buildQueue(
      [
        order({ id: "o1", status: "in_progress" }),
        order({ id: "o2", status: "completed" }),
        order({ id: "o3", status: "cancelled" }),
      ],
      [lead({ id: "l1", status: "new" }), lead({ id: "l2", status: "lost" })]
    );
    expect(rows.filter((r) => r.archived).map((r) => r.key).sort()).toEqual([
      "lead:l2",
      "order:o2",
      "order:o3",
    ]);
  });
});

describe("filterQueue", () => {
  const rows = buildQueue(
    [order({ id: "o1", status: "in_progress" }), order({ id: "o2", status: "completed" })],
    [lead({ id: "l1", status: "new", customerName: "ИП Волков" })]
  );

  it("вкладки: активные без терминальных, архив — только терминальные", () => {
    expect(filterQueue(rows, "active", "").map((r) => r.key).sort()).toEqual([
      "lead:l1",
      "order:o1",
    ]);
    expect(filterQueue(rows, "archive", "").map((r) => r.key)).toEqual(["order:o2"]);
  });

  it("поиск без регистра и с пробелами: номер, контрагент, ТН ВЭД, груз", () => {
    expect(filterQueue(rows, "active", " 17-1 ").map((r) => r.key)).toEqual(["order:o1"]);
    expect(filterQueue(rows, "active", "волкОВ").map((r) => r.key)).toEqual(["lead:l1"]);
    expect(filterQueue(rows, "active", "8471").map((r) => r.key)).toEqual(["order:o1"]);
    expect(filterQueue(rows, "active", "станки").map((r) => r.key)).toEqual(["order:o1"]);
    expect(filterQueue(rows, "active", "витрина")).toHaveLength(0);
  });

  it("«запрос» без номера находится словом «запрос» (поиск по типу)", () => {
    expect(filterQueue(rows, "active", "запрос").map((r) => r.key)).toEqual(["lead:l1"]);
  });
});

describe("queueCounters", () => {
  it("счётчики по реальным статусам из тех же списков", () => {
    const rows = buildQueue(
      [
        order({ id: "o1", status: "in_progress" }),
        order({ id: "o2", status: "calculating" }),
        order({ id: "o3", status: "completed" }),
        order({ id: "o4", status: "completed" }),
      ],
      [lead({ id: "l1" }), lead({ id: "l2", estimate: { customsDutyEstimate: 5 } })]
    );
    expect(queueCounters(rows)).toEqual({ awaiting: 1, inWork: 2, completed: 2 });
  });
});
