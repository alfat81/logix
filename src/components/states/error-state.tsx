import type { LucideIcon } from "lucide-react";
import { TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";

/* TU-01.4 — единое состояние ошибки (каталог TU-01.2 §4). role="alert" —
   скринридер объявляет сразу; иконка и текст — токен destructive
   (пара danger на surface ≥ 4,5 в обеих темах, IC-17). */
export function ErrorState({
  icon: Icon = TriangleAlert,
  title = "Что-то пошло не так",
  description,
  action,
  className = "",
}: {
  icon?: LucideIcon;
  title?: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={`flex flex-col items-center justify-center gap-2 rounded-lg border border-border bg-card px-6 py-10 text-center ${className}`}
    >
      <Icon aria-hidden="true" className="size-8 text-destructive" />
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description && (
        <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
