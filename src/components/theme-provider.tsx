"use client";

/* TU-01.3 — клиентская обвязка темы (D79: V-4 — собственная
   реализация без next-themes и без новых npm-зависимостей).
   Начальный режим приходит с сервера (cookie прочитан в корневом
   layout), поэтому переключатель не мигает при гидрации. Смена
   режима: класс на <html> мгновенно + запись в cookie (V-3, общая
   область Path=/) и localStorage одновременно (ревизия 1.32).
   Режим System слушает prefers-color-scheme и реагирует на смену
   системной темы. */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  DEFAULT_THEME_MODE,
  THEME_STORAGE_KEY,
  resolveDark,
  serializeThemeCookie,
  type ThemeMode,
} from "@/lib/theme";

interface ThemeContextValue {
  mode: ThemeMode;
  resolvedDark: boolean;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const systemDarkQuery = () =>
  window.matchMedia("(prefers-color-scheme: dark)");

export function ThemeProvider({
  initialMode,
  children,
}: {
  initialMode?: ThemeMode;
  children: ReactNode;
}) {
  const [mode, setModeState] = useState<ThemeMode>(initialMode ?? DEFAULT_THEME_MODE);
  const [resolvedDark, setResolvedDark] = useState(false);

  /* Применение темы — один эффект, значение системной темы читается
     ЖИВЬЁМ (matchMedia), а не из состояния-зеркала: устранена гонка
     начальной инициализации, при которой первый прогон эффекта с
     устаревшим systemDark=false снимал класс .dark, выставленный
     THEME_BOOT_SCRIPT до гидрации, и возникал FOUC при первом входе
     в System на тёмной ОС (замечание 2 владельца). Первый прогон
     повторяет решение boot-скрипта — визуального скачка нет. */
  useEffect(() => {
    const query = systemDarkQuery();
    const apply = () => {
      const dark = resolveDark(mode, query.matches);
      setResolvedDark(dark);
      document.documentElement.classList.toggle("dark", dark);
    };
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, [mode]);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    // V-3: cookie в общей области сайта и кабинетов; ревизия 1.32:
    // localStorage — зеркало выбора. Secure — только в production.
    const secure = window.location.protocol === "https:";
    document.cookie = serializeThemeCookie(next, secure);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // localStorage может быть недоступен (режим инкогнито/политики) —
      // cookie остаётся единственным источником.
    }
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ mode, resolvedDark, setMode }),
    [mode, resolvedDark, setMode],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme вне ThemeProvider");
  return ctx;
}
