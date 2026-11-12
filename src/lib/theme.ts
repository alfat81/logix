/* TU-01.3 — модуль темы (D79: V-3 cookie в общей области, V-4 без
   next-themes). Чистая логика без DOM — тестируется в node-окружении.
   Приоритет источников (ревизия 1.32): явный выбор → cookie → System.
   Куки НЕ очищаются при выходе/смене пользователя — предпочтение
   переживает logout, повторный вход и вход другого пользователя в том
   же браузере (проверки TU-01.3 e2e). */

export type ThemeMode = "light" | "dark" | "system";

export const THEME_MODES: readonly ThemeMode[] = ["light", "dark", "system"] as const;

export const THEME_COOKIE_NAME = "logix-theme";
export const THEME_STORAGE_KEY = "logix-theme";

/** Срок жизни предпочтения — 1 год (V-3: срок явно определён). */
export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export const DEFAULT_THEME_MODE: ThemeMode = "system";

/** Атрибуты куки предпочтения (V-3/D79: Path=/, срок, SameSite,
    Secure — единая область публичного сайта и кабинетов). */
export interface ThemeCookieOptions {
  path: string;
  maxAge: number;
  sameSite: "Lax";
  secure: boolean;
}

export function themeCookieOptions(secure: boolean): ThemeCookieOptions {
  return { path: "/", maxAge: THEME_COOKIE_MAX_AGE, sameSite: "Lax", secure };
}

export function isThemeMode(value: unknown): value is ThemeMode {
  return typeof value === "string" && (THEME_MODES as readonly string[]).includes(value);
}

/** Разбор значения cookie/localStorage → режим. Чужеродное или
    повреждённое значение → System (безопасный дефолт). */
export function parseThemeMode(raw: string | null | undefined): ThemeMode {
  if (raw == null) return DEFAULT_THEME_MODE;
  const value = raw.trim().toLowerCase().replace(/^"|"$/g, "");
  return isThemeMode(value) ? value : DEFAULT_THEME_MODE;
}

/** Разбор заголовка Cookie / document.cookie → режим темы.
    Берёт последнее вхождение (cookie с Path=/ одна). */
export function parseThemeFromCookieHeader(header: string | null | undefined): ThemeMode {
  if (!header) return DEFAULT_THEME_MODE;
  let result: ThemeMode | null = null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const name = part.slice(0, eq).trim();
    if (name !== THEME_COOKIE_NAME) continue;
    result = parseThemeMode(part.slice(eq + 1).trim());
  }
  return result ?? DEFAULT_THEME_MODE;
}

/** Сериализация куки выбора темы. secure — в production (V-3). */
export function serializeThemeCookie(mode: ThemeMode, secure: boolean): string {
  const opts = themeCookieOptions(secure);
  const parts = [
    `${THEME_COOKIE_NAME}=${mode}`,
    `Path=${opts.path}`,
    `Max-Age=${opts.maxAge}`,
    `SameSite=${opts.sameSite}`,
  ];
  if (opts.secure) parts.push("Secure");
  return parts.join("; ");
}

/** Тёмная ли тема в данном режиме при данной системной настройке. */
export function resolveDark(mode: ThemeMode, systemDark: boolean): boolean {
  if (mode === "dark") return true;
  if (mode === "light") return false;
  return systemDark;
}

/** Класс корневого элемента для resolved-темы. */
export function themeHtmlClass(dark: boolean): string {
  return dark ? "dark" : "";
}

/* Инлайн-скрипт защиты от FOUC: выполняется до первой отрисовки,
   выставляет .dark на <html> по cookie; System читает
   prefers-color-scheme. CSP: script-src содержит 'unsafe-inline'
   (next.config.ts) — скрипт разрешён; внешних загрузок нет. */
export const THEME_BOOT_SCRIPT = `(function(){try{var m=document.cookie.match(/(?:^|; )${THEME_COOKIE_NAME}=([^;]*)/);var t=m?decodeURIComponent(m[1]):"${DEFAULT_THEME_MODE}";if(t!=="light"&&t!=="dark"){t="system"}var d=t==="dark"||(t==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);var c=document.documentElement.classList;if(d){c.add("dark")}else{c.remove("dark")}}catch(e){}})();`;
