import { LoaderCircle } from "lucide-react";

/* TU-01.4 — единое состояние загрузки (каталог TU-01.2 §4). Цвета —
   только канонические токены (обе темы без смешивания). role="status"
   + aria-live="polite" — скринридер объявляет начало/конец загрузки. */

const SIZES = { sm: "size-4", md: "size-6", lg: "size-8" } as const;

export function LoadingState({
  label = "Загрузка…",
  size = "md",
  className = "",
}: {
  label?: string;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex items-center justify-center gap-2 py-8 text-muted-foreground ${className}`}
    >
      <LoaderCircle aria-hidden="true" className={`animate-spin ${SIZES[size]}`} />
      <span className="text-sm">{label}</span>
    </div>
  );
}
