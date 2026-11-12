#!/usr/bin/env python3
"""TU-01.5 — e2e публичных маршрутов (волна 1).

Проверки (карточка TU-01.5 «Проверки»):
  1) главная отвечает 200 и содержит все секции макета homedark.png;
  2) ссылки и CTA ведут на существующие маршруты и якоря секций
     (форма TU-03 — заглушка-якорь #contact, Д-08);
  3) вход клиент/брокер/мастер не сломан (страницы входа отвечают 200);
  4) старые наименования «LOGIX LOGIN», «Logix Entry», «Платформа Logix»
     не переносятся (словарь LIGHT REBRANDING V2.0 — TuLogistica Pro);
  5) ссылка подрядчика — строго по рантайм-флагу D31.

Тема (Light/Dark/System) на публичном сайте покрывается
scripts/e2e_theme_lifecycle.py (браузерный прогон). Запуск:
  BASE_URL=http://127.0.0.1:3000 python3 scripts/e2e_public_site.py
"""

import os
import re
import sys
import urllib.request

BASE = os.environ.get("BASE_URL", "http://127.0.0.1:3000").rstrip("/")

# Флаг D31 в .env песочницы (тот же источник, что у сервера).
CONTRACTOR_FLAG = False
for line in open(os.path.join(os.path.dirname(__file__), "..", ".env")):
    m = re.match(r"\s*CONTRACTOR_PORTAL_ENABLED\s*=\s*\"?([^\"\n#]*)", line)
    if m:
        CONTRACTOR_FLAG = m.group(1).strip().lower() == "true"


def fetch(path: str) -> tuple[int, str]:
    try:
        with urllib.request.urlopen(BASE + path, timeout=30) as r:
            return r.status, r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")


def main() -> int:
    results: list[tuple[bool, str]] = []

    def check(ok: bool, name: str) -> None:
        results.append((ok, name))

    status, html = fetch("/")
    check(status == 200, f"GET / -> {status}")

    # 1) секции макета homedark.png (11 блоков: шапка, hero, о компании,
    #    методология, услуги, workflow, цифровая логистика, преимущества,
    #    CTA, футер — якоря секций + ключевые тексты)
    for fragment, name in [
        ("TULOGISTICA", "логотип TuLogistica Pro (TULOGISTICA.PRO)"),
        ("Professional logistics ecosystem", "eyebrow первого экрана"),
        ("Логистика, которая работает на ваш", "H1 первого экрана"),
        ('id="about"', "секция «о компании»"),
        ("Focus on efficiency", "показатель эффективности"),
        ("Demo sample", "демо-метрика помечена"),
        ('id="approach"', "секция «методология»"),
        ("Системность в каждом решении", "H2 методологии (4 шага)"),
        ('id="services"', "секция «услуги»"),
        ("Международная логистика", "услуга 1 из 5"),
        ("Индивидуальные логистические решения", "услуга 5 из 5"),
        ('id="workflow"', "секция «workflow»"),
        ("От запроса до результата", "H2 workflow (5 шагов)"),
        ("Command Center // Manager view", "превью платформы"),
        ("Платформа TuLogistica Pro", "действующее наименование платформы"),
        ("Есть логистическая задача?", "CTA-секция"),
        ("Фиктивная форма не создаётся", "заглушка TU-03 (Д-08)"),
        ("The evolution of logistic logic", "футер, слоган"),
    ]:
        check(fragment in html, f"главная содержит: {name}")

    # 2) CTA и ссылки — на существующие маршруты/якоря
    for fragment, name in [
        ('href="#contact"', "CTA «Запросить расчёт» -> #contact (Д-08)"),
        ('href="#about"', "навигация -> #about"),
        ('href="#workflow"', "навигация -> #workflow"),
        ('href="/client/login"', "вход клиента"),
        ('href="/broker/login"', "вход брокера"),
        ('href="/admin/login"', "вход сотрудника (мастера)"),
    ]:
        check(fragment in html, f"ссылка на месте: {name}")

    # 3) вход клиент/брокер/мастер не сломан
    for path, name in [
        ("/client/login", "страница входа клиента"),
        ("/broker/login", "страница входа брокера"),
        ("/admin/login", "страница входа сотрудника"),
    ]:
        s, _ = fetch(path)
        check(s == 200, f"GET {path} -> {s} ({name})")

    # 4) старые наименования не переносятся
    for banned, name in [
        ("LOGIX LOGIN", "«LOGIX LOGIN» из макета"),
        ("Logix Entry", "«Logix Entry» из макета"),
        ("Платформа Logix", "«Платформа Logix» из макета"),
    ]:
        check(banned not in html, f"отсутствует {name}")

    # 5) подрядчик — строго по флагу D31
    has_contractor = "Вход для подрядчиков" in html
    if CONTRACTOR_FLAG:
        check(has_contractor, "D31: флаг true — ссылка подрядчика на месте")
    else:
        check(not has_contractor, "D31: флаг false — ссылки подрядчика нет")

    passed = sum(1 for ok, _ in results if ok)
    for ok, name in results:
        print(("PASS " if ok else "FAIL ") + name)
    print(f"Итог: {passed}/{len(results)} проверок пройдено")
    return 0 if passed == len(results) else 1


if __name__ == "__main__":
    sys.exit(main())
