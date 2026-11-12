#!/usr/bin/env python3
"""TU-01.3 — E2E жизненного цикла темы (замечание 4 владельца, 12.11.2026).

Сценарии: первый вход (нет выбора → System), System на тёмной ОС
(FOUC-фикс провайдера), смена системной темы на лету, ручной выбор
Light/Dark/System, cookie + reload, переходы «публичный сайт ↔
кабинеты», смена пользователя в браузере (сессия ушла — предпочтение
осталось). Использует agent-browser (Playwright-обёртка песочницы).

Запуск: поднять сервер (`npm run build && npm start`), затем
  python3 scripts/e2e_theme_lifecycle.py [--base-url http://127.0.0.1:3000]
Код возврата ≠ 0 при провале любого сценария. Отчёт — stdout.
"""
import argparse
import json
import subprocess
import sys
import time

BASE = "http://127.0.0.1:3000"
PAGE = "/design-system"
CABINET = "/client/login"  # публичная страница входа кабинета клиента

results: list[tuple[str, bool, str]] = []


def ab(*args: str) -> str:
    out = subprocess.run(
        ["agent-browser", *args], capture_output=True, text=True, timeout=60
    )
    if out.returncode != 0:
        raise RuntimeError(f"agent-browser {' '.join(args)}: {out.stderr[:200]}")
    return out.stdout.strip()


def check(name: str, ok: bool, detail: str = "") -> None:
    results.append((name, ok, detail))
    print(f"{'PASS' if ok else 'FAIL'}  {name}" + (f"  [{detail}]" if detail and not ok else ""))


def html_classes() -> str:
    return ab("eval", "document.documentElement.className")


def _cookies_raw() -> list[dict]:
    envelope = json.loads(ab("--json", "cookies", "get"))
    return envelope.get("data", {}).get("cookies", [])


def cookie(name: str = "logix-theme") -> str | None:
    for c in _cookies_raw():
        if c.get("name") == name:
            return c.get("value")
    return None


def cookie_attrs() -> dict:
    for c in _cookies_raw():
        if c.get("name") == "logix-theme":
            return c
    return {}


def click_toggle() -> None:
    ab("eval", "document.querySelector('button[data-mode]').click()")
    time.sleep(0.15)


def main() -> int:
    global BASE
    ap = argparse.ArgumentParser()
    ap.add_argument("--base-url", default=BASE)
    args = ap.parse_args()
    BASE = args.base_url.rstrip("/")

    # ── T1. Первый вход: выбора нет → System (светлая ОС по умолчанию)
    ab("set", "media", "light")
    ab("cookies", "clear")
    ab("open", BASE + PAGE)
    time.sleep(0.5)
    check("T1 первый вход: cookie отсутствует", cookie() is None)
    check("T1 первый вход: класс без .dark (System → светлая ОС)", "dark" not in html_classes())

    # ── T2. System на тёмной ОС: boot-скрипт + провайдер без FOUC
    ab("set", "media", "dark")
    ab("reload")
    time.sleep(0.5)
    check("T2 System на тёмной ОС: класс .dark применён", "dark" in html_classes())
    check("T2 System на тёмной ОС: cookie по-прежнему отсутствует", cookie() is None)

    # ── T3. Изменение системной темы в режиме System (без reload)
    ab("set", "media", "light")
    time.sleep(0.4)
    check("T3 смена системной темы: .dark снят на лету", "dark" not in html_classes())
    ab("set", "media", "dark")
    time.sleep(0.4)
    check("T3 смена системной темы: .dark возвращён на лету", "dark" in html_classes())

    # ── T4. Ручной выбор: System → Light → Dark → System
    click_toggle()  # system → light
    check("T4 выбор Light: cookie=light", cookie() == "light")
    check("T4 выбор Light: класс без .dark", "dark" not in html_classes())
    click_toggle()  # light → dark
    check("T4 выбор Dark: cookie=dark", cookie() == "dark")
    check("T4 выбор Dark: класс .dark", "dark" in html_classes())
    click_toggle()  # dark → system
    check("T4 возврат в System: cookie=system", cookie() == "system")

    # ── T5. Явный выбор Dark + reload: cookie и SSR-класс
    click_toggle()  # system → light
    click_toggle()  # light → dark
    ab("reload")
    time.sleep(0.5)
    check("T5 reload: класс .dark сохранён (cookie → SSR)", "dark" in html_classes())
    attrs = cookie_attrs()
    check("T5 cookie Path=/", attrs.get("path") == "/", str(attrs.get("path")))
    check("T5 cookie SameSite=Lax", attrs.get("sameSite") in ("Lax", "lax"), str(attrs.get("sameSite")))
    check("T5 cookie Secure только в production (localhost http — без Secure)", attrs.get("secure") is False, str(attrs.get("secure")))
    check("T5 cookie Max-Age ≈ 1 год (31536000±60)", 31535940 <= int(attrs.get("expires", 0) or 0) - int(time.time()) <= 31536600, str(attrs.get("expires")))

    # ── T6. Переход «публичный сайт ↔ кабинет клиента» (та же cookie Path=/)
    ab("open", BASE + CABINET)
    time.sleep(0.5)
    check("T6 кабинет клиента: класс .dark сохранён", "dark" in html_classes())
    ab("open", BASE + PAGE)
    time.sleep(0.5)
    check("T6 возврат на публичный сайт: .dark сохранён", "dark" in html_classes())

    # ── T7. Смена пользователя в браузере: сессии ушли — предпочтение осталось
    ab("cookies", "clear")
    ab("cookies", "set", "logix-theme", "dark", "--url", BASE, "--path", "/", "--same-site", "Lax")
    ab("reload")
    time.sleep(0.5)
    check("T7 смена пользователя: сессий нет, тема .dark сохранилась", "dark" in html_classes())
    check("T7 смена пользователя: cookie=dark", cookie() == "dark")

    failed = [r for r in results if not r[1]]
    print(f"\nИтог: {len(results) - len(failed)}/{len(results)} проверок пройдено")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
