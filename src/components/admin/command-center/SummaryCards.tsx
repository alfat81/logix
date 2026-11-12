"use client";

/* TU-01.6 — сводные карточки Command Center // Обзор (референс
   commandcenter.png). Четыре показателя — ТОЛЬКО реальные данные
   системы (демо-данные макета не переносятся):
   • «Новые заявки», «Согласовано», «В пути» — счётчики из БД, props;
   • «Требуют внимания» — сумма счётчиков секций экрана «Требует
     внимания» (тот же API GET /api/admin/attention, что у самого
     экрана — единый источник, Ж5); грузится на клиенте, до ответа — «—».
   Пары цветов иконок — принятые пары статус-бейджей §3.2 (IC-17). */

import { useEffect, useState } from "react";
import Link from "next/link";
import { CircleCheck, Inbox, TriangleAlert, Truck } from "lucide-react";

type AttentionCounts = {
  counts?: {
    overdue: number;
    problem: number;
    unassigned: number;
    staleLeads: number;
  };
};

const CARDS = [
  {
    key: "new",
    label: "Новые заявки",
    icon: Inbox,
    chip: "bg-accent-tint text-accent-text",
    sub: "В работе менеджера",
  },
  {
    key: "attention",
    label: "Требуют внимания",
    icon: TriangleAlert,
    chip: "bg-status-delay-bg text-foreground",
    sub: "Просрочки, проблемы, простои",
  },
  {
    key: "approved",
    label: "Согласовано",
    icon: CircleCheck,
    chip: "bg-status-delivered-bg text-status-delivered-fg",
    sub: "Ожидают преобразования в заказ",
  },
  {
    key: "transit",
    label: "В пути",
    icon: Truck,
    chip: "bg-status-transit-bg text-foreground",
    sub: "Активные перевозки",
  },
] as const;

export function SummaryCards({
  newLeads,
  approved,
  inTransit,
}: {
  newLeads: number;
  approved: number;
  inTransit: number;
}) {
  const [attention, setAttention] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/admin/attention")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: AttentionCounts) => {
        const c = d.counts;
        if (alive && c) {
          setAttention(c.overdue + c.problem + c.unassigned + (c.staleLeads ?? 0));
        }
      })
      .catch(() => {
        if (alive) setAttention(null);
      });
    return () => {
      alive = false;
    };
  }, []);

  const values: Record<(typeof CARDS)[number]["key"], number | null> = {
    new: newLeads,
    attention,
    approved,
    transit: inTransit,
  };
  const hrefs: Record<(typeof CARDS)[number]["key"], string> = {
    new: "/admin/leads",
    attention: "#attention",
    approved: "/admin/leads",
    transit: "/admin/orders",
  };

  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      {CARDS.map(({ key, label, icon: Icon, chip, sub }) => (
        <Link
          key={key}
          href={hrefs[key]}
          className="group flex items-start justify-between gap-3 rounded-lg border border-border bg-card p-4 transition-colors outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] hover:bg-accent"
        >
          <div className="min-w-0">
            <p className="font-mono text-xs font-medium uppercase tracking-widest text-muted-foreground">
              {label}
            </p>
            <p className="mt-2 text-3xl font-bold text-foreground" aria-label={`${label}: ${values[key] ?? "—"}`}>
              {values[key] ?? "—"}
            </p>
            <p className="mt-1 truncate text-xs text-muted-foreground">{sub}</p>
          </div>
          <span aria-hidden="true" className={`flex size-9 shrink-0 items-center justify-center rounded-md ${chip}`}>
            <Icon className="size-5" />
          </span>
        </Link>
      ))}
    </div>
  );
}
