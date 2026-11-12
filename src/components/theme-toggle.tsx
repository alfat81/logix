"use client";

/* TU-01.3 — переключатель Light / Dark / System. Доступная подпись и
   aria-метка на русском; размещение в навигации четырёх интерфейсов —
   волны TU-01.5–01.8. Иконки lucide-react — существующая зависимость. */

import { Monitor, Moon, Sun } from "lucide-react";
import { THEME_MODES, type ThemeMode } from "@/lib/theme";
import { useTheme } from "@/components/theme-provider";

const MODE_ICON = {
  light: Sun,
  dark: Moon,
  system: Monitor,
} as const;

const MODE_TITLE: Record<ThemeMode, string> = {
  light: "Тема: светлая",
  dark: "Тема: тёмная",
  system: "Тема: системная",
};

/* Имя ЦЕЛЕВОГО (следующего) режима для подписи действия — берётся из
   порядка THEME_MODES, поэтому подпись не может разойтись с
   фактическим следующим режимом (замечание 1 владельца). */
const TARGET_THEME_NAME: Record<ThemeMode, string> = {
  light: "светлую",
  dark: "тёмную",
  system: "системную",
};

export function ThemeToggle({ className }: { className?: string }) {
  const { mode, setMode } = useTheme();
  const next = THEME_MODES[(THEME_MODES.indexOf(mode) + 1) % THEME_MODES.length];
  const Icon = MODE_ICON[mode];
  const switchTo = `Переключить на ${TARGET_THEME_NAME[next]} тему`;
  return (
    <button
      type="button"
      onClick={() => setMode(next)}
      className={className}
      aria-label={switchTo}
      title={MODE_TITLE[mode]}
      data-mode={mode}
    >
      <Icon aria-hidden="true" size={18} />
      <span className="sr-only">{switchTo}</span>
    </button>
  );
}
