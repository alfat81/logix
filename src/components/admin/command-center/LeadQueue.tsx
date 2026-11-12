import Link from "next/link";
import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LeadStatusBadge } from "@/components/admin/LeadStatusBadge";
import { EmptyState } from "@/components/states/empty-state";
import { LEAD_STATUS_LABELS, type LeadStatus } from "@/lib/leads";

/* TU-01.6 — «Очередь обработки // Заявки» (референс commandcenter.png):
   заявки, требующие действия менеджера, — только реальные данные БД
   (демо-строки макета не переносятся). Быстрое действие «В ЗАКАЗ» —
   ссылка на карточку заявки с авто-открытием СУЩЕСТВУЮЩЕГО диалога
   подтверждения конвертации (?convert=1 → LeadConvertBlock): прямого
   преобразования без явного подтверждения менеджера нет (обязательная
   адаптация макета), логика конвертации — в одном месте (API В4). */

export type QueueLead = {
  id: string;
  status: LeadStatus;
  contactName: string;
  updatedLabel: string;
};

export function LeadQueue({ items }: { items: QueueLead[] }) {
  if (!items.length) {
    return (
      <EmptyState
        title="Очередь пуста"
        description="Нет заявок со статусами «Новый» и «Согласован клиентом» — все обработаны."
      />
    );
  }
  return (
    <ul className="space-y-2">
      {items.map((lead) => (
        <li
          key={lead.id}
          className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-border bg-card px-4 py-3"
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <LeadStatusBadge status={lead.status} />
              <span className="truncate text-sm font-medium text-foreground">
                {lead.contactName || "Без имени"}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Обновлена {lead.updatedLabel} ·{" "}
              {LEAD_STATUS_LABELS[lead.status] === "Согласован клиентом"
                ? "ждёт преобразования в заказ"
                : "ждёт расчёта"}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href={`/admin/leads/${lead.id}`}>
                <Eye aria-hidden="true" className="size-4" />
                Просмотр
              </Link>
            </Button>
            {lead.status === "client_approved" && (
              <Button asChild size="sm" className="text-xs uppercase tracking-wide">
                <Link href={`/admin/leads/${lead.id}?convert=1`}>В заказ</Link>
              </Button>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
