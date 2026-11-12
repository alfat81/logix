import { describe, expect, it } from "vitest";
import {
  DEFAULT_THEME_MODE,
  THEME_COOKIE_MAX_AGE,
  THEME_COOKIE_NAME,
  isThemeMode,
  parseThemeFromCookieHeader,
  parseThemeMode,
  resolveDark,
  serializeThemeCookie,
  themeCookieOptions,
  themeHtmlClass,
} from "@/lib/theme";

describe("theme: разбор режима (V-4)", () => {
  it("валидные значения распознаются во всех регистрах", () => {
    expect(parseThemeMode("dark")).toBe("dark");
    expect(parseThemeMode("LIGHT")).toBe("light");
    expect(parseThemeMode(" System ")).toBe("system");
    expect(parseThemeMode('"dark"')).toBe("dark"); // кавычки cookie-кодирования
  });

  it("чужеродное/повреждённое значение → System (дефолт)", () => {
    expect(parseThemeMode("blue")).toBe("system");
    expect(parseThemeMode("")).toBe("system");
    expect(parseThemeMode(null)).toBe("system");
    expect(parseThemeMode(undefined)).toBe("system");
    expect(parseThemeMode("dark; Path=/")).toBe("system");
  });

  it("isThemeMode — типовой страж", () => {
    expect(isThemeMode("dark")).toBe(true);
    expect(isThemeMode("auto")).toBe(false);
    expect(isThemeMode(42)).toBe(false);
  });
});

describe("theme: разбор заголовка Cookie (V-3)", () => {
  it("находит logix-theme среди других кук", () => {
    const header = "session=abc; logix-theme=dark; consent=1";
    expect(parseThemeFromCookieHeader(header)).toBe("dark");
  });

  it("отсутствие куки → System", () => {
    expect(parseThemeFromCookieHeader("session=abc")).toBe("system");
    expect(parseThemeFromCookieHeader(null)).toBe("system");
    expect(parseThemeFromCookieHeader("")).toBe("system");
  });

  it("повреждённое значение → System", () => {
    expect(parseThemeFromCookieHeader("logix-theme=purple")).toBe("system");
  });

  it("последнее вхождение побеждает", () => {
    expect(parseThemeFromCookieHeader("logix-theme=dark; logix-theme=light")).toBe("light");
  });
});

describe("theme: сериализация куки (V-3/D79 — атрибуты явны)", () => {
  it("Path=/, Max-Age=год, SameSite=Lax; Secure в production", () => {
    const secure = serializeThemeCookie("dark", true);
    expect(secure).toBe(
      `${THEME_COOKIE_NAME}=dark; Path=/; Max-Age=${THEME_COOKIE_MAX_AGE}; SameSite=Lax; Secure`,
    );
    const insecure = serializeThemeCookie("light", false);
    expect(insecure).not.toContain("Secure");
    expect(insecure).toContain("SameSite=Lax");
  });

  it("атрибуты совпадают с объявленной спецификацией", () => {
    const opts = themeCookieOptions(true);
    expect(opts).toEqual({ path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "Lax", secure: true });
  });
});

describe("theme: разрешение тёмной темы (System — начальный режим)", () => {
  it("явный выбор сильнее системы", () => {
    expect(resolveDark("dark", false)).toBe(true);
    expect(resolveDark("light", true)).toBe(false);
  });

  it("System следует системной настройке", () => {
    expect(resolveDark("system", true)).toBe(true);
    expect(resolveDark("system", false)).toBe(false);
  });

  it("класс корня", () => {
    expect(themeHtmlClass(true)).toBe("dark");
    expect(themeHtmlClass(false)).toBe("");
  });

  it("дефолтный режим — System", () => {
    expect(DEFAULT_THEME_MODE).toBe("system");
  });
});
