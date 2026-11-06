#!/usr/bin/env python3
"""ERD ред. 1.6 (erd-docs-center-v15): копия v14 + bindingState / дифф-сохранение, рендер PNG."""
from pathlib import Path

from playwright.sync_api import sync_playwright

MOCK = Path("/home/z/my-project/download/DOC-CENTER/mockups")
SRC = MOCK / "erd-docs-center-v14.html"
DST = MOCK / "erd-docs-center-v15.html"

s = SRC.read_text(encoding="utf-8")

pairs = [
    ("<title>Logix DF-26 — уточнённая модель данных документов (ред. 1.4)</title>",
     "<title>Logix DF-26 — уточнённая модель данных документов (ред. 1.6)</title>"),
    ("<h1>DF-26 «Единый центр документов заявки» — модель данных, редакция 1.4</h1>",
     "<h1>DF-26 «Единый центр документов заявки» — модель данных, редакция 1.6</h1>"),
    ("Три новые таблицы — PermitCheck (с ограничениями целостности), PermitCheckItem (охват позиций) и PermitCheckRequirement; остальные — расширения. Розовым — новое/изменённое (замечания владельца от 04.11 к ред. 1.2–1.3).",
     "Три новые таблицы — PermitCheck, PermitCheckItem (охват позиций), PermitCheckRequirement; остальные — расширения (розовым)."),
    ("<span>новая таблица / новое поле (ред. 1.3–1.4)</span>",
     "<span>новая таблица / новое поле (ред. 1.3–1.6)</span>"),
    ('<div class="row" style="margin-top:8px; color:var(--muted)"><span>Снимки «кто» = <span class="lbl-new">&nbsp;userName&nbsp;+&nbsp;companyName&nbsp;</span> — два исторических значения (уточнение 1)</span></div>',
     '<div class="row" style="margin-top:8px; color:var(--muted)"><span>Снимки «кто» = <span class="lbl-new">&nbsp;userName&nbsp;+&nbsp;companyName&nbsp;</span> — два исторических значения (уточнение 1)</span></div>\n'
     '    <div class="row" style="color:var(--muted)"><span>Ред. 1.6 — bindingState «требует ручной привязки» (PermitRequirement); дифф-сохранение оценки: id строки = идентичность позиции</span></div>'),
    # PermitRequirement: itemId + новая строка bindingState
    ('<div class="fr"><span class="fn">itemId</span><span class="fd">позиция оценки брокера (remap по коду)</span></div>',
     '<div class="fr"><span class="fn">itemId</span><span class="fd">позиция оценки брокера; идентичность — id строки (дифф-сохранение)</span></div>\n'
     '      <div class="fr new"><span class="fn">bindingState</span><span class="fd">bound | pending_manual — «требует ручной привязки»; NULL автоматически не присваивается (ред. 1.6)</span></div>'),
    # PermitCheckItem: охват без remap
    ('<span class="fd">→ BrokerEstimateItem (без FK, remap по коду)</span>',
     '<span class="fd">→ BrokerEstimateItem (без FK; охват — актуальные строки кода)</span>'),
    # BrokerEstimateItem: правило идентичности
    ('<div class="fr"><span class="fn">hsCode</span><span class="fd">ТН ВЭД, 10 знаков; появление/изменение кода → PermitCheck</span></div>',
     '<div class="fr"><span class="fn">hsCode</span><span class="fd">ТН ВЭД, 10 знаков; появление/изменение кода → PermitCheck</span></div>\n'
     '      <div class="fr new"><span class="fn">id строки</span><span class="fd">идентичность позиции; PUT оценки — дифф-сохранение, строки не пересоздаются (ред. 1.6)</span></div>'),
    ('<div class="eh">Правила (замечания владельца от 04.11 · ред. 1.4)</div>',
     '<div class="eh">Правила (замечания владельца от 04.11 · ред. 1.6)</div>'),
    # Правила: п. 8
    ('<div class="fr new"><span class="fd">7. Откат миграции — три сценария (§10.3 п. 5): до записи данных — просто; после начала эксплуатации — только с архивированием новых данных или «заморозкой»; после неудачи — транзакционный откат целиком и доведение до полного состояния.</span></div>',
     '<div class="fr new"><span class="fd">7. Откат миграции — три сценария (§10.3 п. 5): до записи данных — просто; после начала эксплуатации — только с архивированием новых данных или «заморозкой»; после неудачи — транзакционный откат целиком и доведение до полного состояния.</span></div>\n'
     '      <div class="fr new"><span class="fd">8. Привязка к позиции (ред. 1.6): идентичность позиции — id строки; дифф-сохранение оценки не пересоздаёт строки; автоматический перенос связей — только для строк с сохранённым id; удалённая строка → требования в «требует ручной привязки» (bindingState = pending_manual, itemId не NULL), история и статус нетронуты, область требования автоматически не расширяется; itemId = NULL («ко всей сделке») — только осознанное решение сотрудника.</span></div>'),
]

missed = []
for old, new in pairs:
    n = s.count(old)
    if n != 1:
        missed.append(f"{n}x: {old[:70]}")
    else:
        s = s.replace(old, new)
if missed:
    print("ПРОПУЩЕНО:")
    for m in missed:
        print(" -", m)
    raise SystemExit(1)

DST.write_text(s, encoding="utf-8")
print("HTML записан:", DST)

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1560, "height": 1580}, device_scale_factor=2)
    page.goto(f"file://{DST}")
    page.wait_for_timeout(400)
    page.screenshot(path=str(MOCK / "erd-docs-center-v15.png"), full_page=True)
    page.close()
    browser.close()
    print("OK erd-docs-center-v15.png")
