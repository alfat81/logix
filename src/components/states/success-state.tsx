import { CircleCheck } from "lucide-react";

/* TU-01.4 — единое состояние успеха (каталог TU-01.2 §4). role="status";
   иконка и текст — токен success (пара success на surface ≥ 4,5 в обеих
   темах, IC-17). */
export function SuccessState({
  title,
  description,
  className = "",
}: {
  title: string;
  description?: string;
  className?: string;
}) {
  return (
    <div
      role="status"
      className={`flex flex-col items-center justify-center gap-2 rounded-lg border border-border bg-card px-6 py-10 text-center ${className}`}
    >
      <CircleCheck aria-hidden="true" className="size-8 text-success" />
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description && (
        <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      )}
    </div>
  );
}
