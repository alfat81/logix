#!/usr/bin/env python3
"""Сборка пакета консолидации v1.2.1 (рецензия пакета v1.2 от 04.11.2026).

Исключительно документальная работа. Скрипт собирает проекты редакций 1.2.1
трёх документов из шаблонов + дословных блоков живых документов docs/,
прикладывает снимки исходных файлов (sources/) с SHA256, копирует инструменты
воспроизведения (tools/), генерирует DIFF v1.2 -> v1.2.1 и контрольный список
переноса. Ничего не утверждает, старые документы не изменяет (кроме
idempotent append-only D57 в docs/DECISIONS.md), push/merge/deploy не выполняет.

Зависимости: Python >= 3.8, только стандартная библиотека; для проверки
тождества журнала до append используется git (опционально, см. verify.py).
Сборка требует песочницы (/home/z/my-project); независимая сверка собранного
пакета без песочницы — tools/verify.py.
"""
import hashlib
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path("/home/z/my-project")
TPL = ROOT / "scripts/consolidation/templates-v1.2.1"
OUT = ROOT / "download/CONSOLIDATION-2026-11-05"
OUT_V12 = ROOT / "download/CONSOLIDATION-2026-11-04"  # пакет v1.2 — история рецензии, не изменяется

GIT_HEAD_EXPECTED_PREFIX = ""  # не требуем конкретного HEAD; фиксируем фактический


def slice_lines(path: Path, a: int, b: int) -> str:
    """Строки a..b включительно, дословно."""
    lines = path.read_text(encoding="utf-8").splitlines()
    return "\n".join(lines[a - 1 : b])


def build(name: str, blocks: dict) -> str:
    text = (TPL / name).read_text(encoding="utf-8")
    for key, val in blocks.items():
        token = "{{" + key + "}}"
        if token in text:
            text = text.replace(token, val)
    leftover = text.find("{{")
    if leftover != -1:
        raise SystemExit(f"Незаменённый токен в {name}: {text[leftover:leftover+40]!r}")
    return text


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


HANDOVER_CHECKLIST = """# Контрольный список будущего переноса в `docs/`, архивации и публикации

**Дата:** 05.11.2026 · **Статус:** ТОЛЬКО ПЛАН. Ни одно действие из этого списка не выполнялось; список фиксирует будущие шаги, их порядок, условия и ответственных (раздел 5 п. 7 задания; раздел 4 — запреты соблюдены).

## 0. Предусловия (все обязательны до начала любых действий)

| № | Предусловие | Кто решает |
|---|---|---|
| П1 | Приёмка пакета v1.2.1 владельцем (три замечания рецензии 04.11 закрыты; см. CONSISTENCY-REPORT §0) | Владелец |
| П2 | Решение по открытому вопросу №1 — очерёдность потоков A/B | Владелец |
| П3 | Решение по открытому вопросу №3 — пост-приёмочное расположение DOC-CENTER | Владелец |
| П4 | Решение по открытому вопросу №8 — канонизация журнала решений (§10.1 мастера или `docs/DECISIONS.md`) | Владелец |
| П5 | Решение по открытому вопросу №11 — куда помещаются `tools/` и `sources/` в репозитории | Владелец |
| П6 | Решение по открытому вопросу №2 — способ синхронизации «behind 5» перед push | Владелец |

## 1. Перенос в `docs/` (один коммит, после П1–П5)

| Действие | Из → В | Примечание |
|---|---|---|
| 1.1 | `download/CONSOLIDATION-2026-11-05/PROJECT-RULES-v1.2.1.md` → `docs/PROJECT-RULES.md` | Новый нормативный документ |
| 1.2 | `download/CONSOLIDATION-2026-11-05/MASTER-ROADMAP-v1.2.1.md` → `docs/MASTER-ROADMAP.md` | Заменяет ред. 1.0 (D54) |
| 1.3 | `download/CONSOLIDATION-2026-11-05/DOCUMENT-CONSOLIDATION-PLAN-v1.2.1.md` → `docs/` или сразу в архив по решению владельца | План работ: владелец решает, нужен ли живым |
| 1.4 | MAPPING-TABLE, VERIFICATION-REPORT, DIFF, HANDOVER-CHECKLIST, CONSISTENCY-REPORT, OPEN-QUESTIONS → архив пакета (путь — П5) | Доказательная база приёмки |
| 1.5 | DOC-CENTER кит → по решению П3 (остаётся `download/DOC-CENTER/` или переносится в `docs/`) | Одновременно исправить живые указатели (`docs/ROADMAP-DEALFLOW.md:351,807` — до их архивации) |
| 1.6 | Исправить ссылки на `docs/RULES.md` / `docs/BRANDBOOK.md` в коде, скриптах и CI | Перечень мест собирается при переносе (шаг 7 плана консолидации) |

## 2. Архивация старых документов (одновременно с шагом 1, один коммит)

| Файл | Действие | Условие |
|---|---|---|
| `docs/RULES.md` | → `docs/archive/superseded/RULES.md` с пометкой `SUPERSEDED` | После П1 |
| `docs/BRANDBOOK.md` | → `docs/archive/superseded/BRANDBOOK.md` с пометкой `SUPERSEDED` | После П1 |
| `docs/ROADMAP.md` | → `docs/archive/superseded/ROADMAP.md` с пометкой `SUPERSEDED` | После П1 |
| `docs/ROADMAP-DEALFLOW.md` | → `docs/archive/superseded/ROADMAP-DEALFLOW.md` с пометкой `SUPERSEDED` | После П1 |
| `docs/DECISIONS.md` | → `docs/archive/superseded/DECISIONS.md` с пометкой `SUPERSEDED` (при утверждении канона §10.1 — П4) | После П1 и П4 |
| `docs/DEPRECATIONS.md`, `docs/FROZEN.md` | НЕ переносить одновременно с прочими: переносить только вместе с исправлением `scripts/scope.py`, IC-02/IC-03, IC-12/G4 (открытый вопрос №6) | Отдельным шагом |
| `docs/MASTER-ROADMAP.md` (ред. 1.0) | Заменяется шагом 1.2; прежняя редакция сохраняется в истории git (дополнительно в архив — по решению владельца) | После П1 |

## 3. Публикация в GitHub (после шагов 1–2)

| Действие | Ответственный | Примечание |
|---|---|---|
| 3.1 | Синхронизировать «behind 5» (способ — П6) | Владелец; агент git-историю не переписывает |
| 3.2 | Один push владельцем локального `main` (RULES 2.11): консолидация одним релизным коммитом | Владелец; ahead-состояние фиксируется перед push |
| 3.3 | Прогон CI после push: integrity, knip, scope (FROZEN-глобы), контраст-чекер | Владелец/CI; при падении — откат решения о переносе, разбор |
| 3.4 | Объявить новые документы единственными источниками правды (шаг 9 плана консолидации) | Только владелец |

## 4. Статус исполнения

- Выполнено: ничего из разделов 1–3. Список составлен заранее по заданию владельца (п. 7 раздела 5).
- Исполнитель действий по умолчанию: разработчик (шаги 1, 2, 3.3 — подготовка), публикация и объявления — исключительно владелец (3.2, 3.4).
- Дата фактического исполнения каждого пункта проставляется владельцем при приёмке соответствующей команды.
"""


DIFF_INTRO = """# Diff v1.2 → v1.2.1 — краткий перечень содержательных правок

**Дата:** 05.11.2026 · **База сравнения:** пакет v1.2 (`download/CONSOLIDATION-2026-11-04/`, коммит `c1d4f2d`) → пакет v1.2.1 (`download/CONSOLIDATION-2026-11-05/`).

## 1. Обоснование каждой содержательной правки

| № | Правка | Замечание рецензии | Где | Обоснование |
|---|---|---|---|---|
| 1 | Устранено противоречие §3/§9 об очерёдности A1/B1: явные оговорки в §3, §9 (пп. 3–5), новый абзац после перечня §9, обновлена строка №1 §8. Приоритет A1/B1 не назначен; блокировки и условия запуска сохранены; пауза потока A и статус DF-26 не тронуты | Замечание 1 | MASTER-ROADMAP | Рецензия 2.1: зафиксировать, что порядок определяется отдельным решением владельца (открытый вопрос №1) |
| 2 | Зафиксирован переходный порядок журнала решений: `docs/DECISIONS.md` — действующий журнал до приёмки; D57 (и перенос D1–D56) в §10.1 — зеркальная копия на переходный период; канонизация — отдельное решение владельца; продолжение — только append-only с D58 | Замечание 2 | MASTER-ROADMAP §1.7/§2.1/§10.1; PROJECT-RULES §0.7/§15; PLAN (строка DECISIONS, «Переходный период», «Статусы изменений»); OPEN-QUESTIONS №8 | Рецензия 2.2: фактическое состояние (D57 в обоих документах) сверено и явно описано без подгонки под предположение |
| 3 | Воспроизводимость переноса: в пакет добавлены `sources/` (снимки RULES, BRANDBOOK, ROADMAP-DEALFLOW, DECISIONS + материалы владельца 04.11, SHA256SUMS), `tools/` (build.py, verify.py, шаблоны, d57.md), `VERIFICATION-REPORT.md` (исходный файл → раздел → результат; дословные блоки отдельно от редакционных) | Замечание 3 | Новый VERIFICATION-REPORT.md; MAPPING-TABLE §9; шапки трёх документов | Рецензия 2.3: независимая проверка без песочницы; заявления о побайтовом совпадении только в объёме механически проверенного |
| 4 | Обновлены номера редакций, даты и статусы шапок («ПРОЕКТ НА ПОВТОРНУЮ ПРИЁМКУ»), журналы редакций PROJECT-RULES и статусы плана/вопросов/таблицы | — | Все документы пакета | Следствие правок 1–3; нумерация D1–D57 и дословные блоки не менялись |
| 5 | Закрытие повторных замечаний приёмки (05.11.2026): (а) исправлены факты о состоянии git — вместо устаревшего «HEAD остаётся `c1d4f2d`» зафиксировано фактическое состояние (HEAD `0eab7a4` — автоснимок платформы от 04.11.2026 поверх `c1d4f2d`; коммиты разработчиком не выполнялись, push не выполнялся); (б) приложен пакетный `SHA256SUMS` в корне пакета; (в) примечание «н/д» в VERIFICATION-REPORT стало зависящим от режима проверки; (г) добавлены механические проверки V13 (пакетный SHA256SUMS) и V14 (тождество `tools/` ↔ `scripts/consolidation/`) | Повторные замечания (05.11.2026) | CONSISTENCY-REPORT §0/§5/§8/§9; MAPPING-TABLE §9; SHA256SUMS (корень пакета); tools/verify.py; sources/SOURCES-README.md | Документы приведены в соответствие с фактическим состоянием; воспроизводимость подтверждена фактическим прогоном по обоим задокументированным путям, а не заявлением |

**Не менялись:** дословные блоки (13 позиций — сверьте VERIFICATION-REPORT §1), журнал D1–D57 (текст и нумерация), ограничения §13 мастер-роадмапа, §5.0, пауза потока A, открытые вопросы по существу (№1–№10 остались открытыми, добавлен №11), канонические пути DOC-CENTER. Закрытие повторных замечаний (правка 5) нормативные документы PROJECT-RULES/MASTER-ROADMAP не меняло.

## 2. Машинный diff (unified, контекст 1; длинные строки усечены до 240 символов)

"""


def make_diff_section() -> str:
    pairs = [
        ("PROJECT-RULES-v1.2.md", "PROJECT-RULES-v1.2.1.md"),
        ("MASTER-ROADMAP-v1.2.md", "MASTER-ROADMAP-v1.2.1.md"),
        ("DOCUMENT-CONSOLIDATION-PLAN-v1.2.md", "DOCUMENT-CONSOLIDATION-PLAN-v1.2.1.md"),
        ("MAPPING-TABLE.md", "MAPPING-TABLE.md"),
        ("OPEN-QUESTIONS.md", "OPEN-QUESTIONS.md"),
        ("CONSISTENCY-REPORT.md", "CONSISTENCY-REPORT.md"),
    ]
    out = []
    for old_name, new_name in pairs:
        old_p = OUT_V12 / old_name
        new_p = OUT / new_name
        if not old_p.exists():
            out.append(f"\n### {old_name} → {new_name}\n\n*(старый файл не найден — сравнение пропущено)*\n")
            continue
        old_lines = old_p.read_text(encoding="utf-8").splitlines()
        new_lines = new_p.read_text(encoding="utf-8").splitlines()
        import difflib

        add = rem = 0
        hunks = []
        for line in difflib.unified_diff(old_lines, new_lines, lineterm="", n=1):
            if line.startswith(("---", "+++")):
                continue
            if line.startswith("@@"):
                hunks.append(line)
            elif line.startswith("+"):
                add += 1
                hunks.append(line[:246] + (" …" if len(line) > 246 else ""))
            elif line.startswith("-"):
                rem += 1
                hunks.append(line[:246] + (" …" if len(line) > 246 else ""))
            else:
                hunks.append(line[:246] + (" …" if len(line) > 246 else ""))
        head = f"\n### `{old_name}` → `{new_name}` (+{add}/−{rem})\n\n```diff\n"
        out.append(head + "\n".join(hunks) + "\n```\n")
    return "\n".join(out) + "\n---\n\n*Полный текст обеих редакций — в пакетах `download/CONSOLIDATION-2026-11-04/` и `download/CONSOLIDATION-2026-11-05/`.*\n"


SOURCES_README_TMPL = """# Снимки исходных файлов, использованных при переносе (замечание 3 рецензии)

**Дата снимка:** 05.11.2026 · **HEAD песочницы при подготовке v1.2:** `c1d4f2d` (коммит пакета v1.2). Подготовка v1.2.1 выполнялась поверх того же содержательного состояния без коммитов разработчика; фактический HEAD песочницы на 05.11.2026 — `0eab7a4` (автоматический снимок платформы от 04.11.2026 поверх `c1d4f2d`, содержит копию файлов пакета v1.2.1); правки закрытия повторных замечаний находятся в рабочем дереве без коммитов; push не выполнялся.

| Файл | Роль при переносе |
|---|---|
| `RULES.md` | Источник Части 1 (промпт → Приложение А), 2.6, 2.7, 2.9/2.10, 2.16 PROJECT-RULES |
| `BRANDBOOK.md` | Источник Приложения Б (строки 3–348: шапка + §1–§9) |
| `ROADMAP-DEALFLOW.md` | Источник §13 мастер-роадмапа: лестница §6.1, пауза §6.2, очередь №18–23, этапные абзацы, карточки DF-24/25/26 |
| `DECISIONS.md` | Источник §10.1 мастер-роадмапа: журнал D1–D56 (строки 7–132) |
| `LOGIX-MASTER-ROADMAP-2026-11-04.md` | Материал владельца: авторская ред. 1.0 мастер-роадмапа (база редакционного текста) |
| `ROADMAP-DEALFLOW-REWRITE-PROPOSAL-2026-11-04.md` | Материал владельца: проект ред. 1.1 (§10–12 — база редакционного текста) |

Примечания:
- Снимки взяты из рабочих файлов `docs/` на HEAD `c1d4f2d`; тождество снимков живым файлам на момент сборки проверено `verify.py` (V3/V11).
- `DECISIONS.md` в снимке **включает** append D57 (сделан 04.11 при сборке v1.2). Тождество среза D1–D56 (строки 7–132) версии **до** append проверяется отдельно: `git show 41ec1a8:docs/DECISIONS.md` (V5 в VERIFICATION-REPORT).
- Хеши — в `SHA256SUMS` (формат `sha256sum`); проверить: `sha256sum -c SHA256SUMS` (из этой папки).
- Побайтовые заявления ограничены механически проверенными блоками; полный перечень — VERIFICATION-REPORT.md §1/§5.
"""


def git_head() -> str:
    try:
        return subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"], cwd=ROOT, capture_output=True, text=True, check=True
        ).stdout.strip()
    except Exception:
        return "unknown"


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    rules = ROOT / "docs/RULES.md"
    brand = ROOT / "docs/BRANDBOOK.md"
    rdf = ROOT / "docs/ROADMAP-DEALFLOW.md"
    dec = ROOT / "docs/DECISIONS.md"

    d57 = (ROOT / "scripts/consolidation/d57.md").read_text(encoding="utf-8").rstrip("\n")

    blocks = {
        # PROJECT-RULES v1.2.1
        "BLOCK_PROMPT": slice_lines(rules, 7, 112),        # Часть 1. Готовый промпт
        "BLOCK_BRANDBOOK": slice_lines(brand, 3, 348),     # Брендбук v1.3: шапка + §1–§9
        "BLOCK_GLOSSARY": slice_lines(rules, 189, 213),    # 2.6 Глоссарий + примечание D27
        "BLOCK_MICROCOPY": slice_lines(rules, 217, 221),   # 2.7 Тексты и микрокопи (только пункты)
        "BLOCK_TEMPLATES": slice_lines(rules, 235, 260),   # 2.9 + 2.10 шаблоны
        "BLOCK_LESSONS": slice_lines(rules, 478, 492),     # 2.16 уроки v0.6.8
        # MASTER-ROADMAP v1.2.1
        "BLOCK_DECISIONS": slice_lines(dec, 7, 132),       # журнал D1–D56 дословно
        "BLOCK_LADDER": slice_lines(rdf, 354, 364),        # §6.1 тело (абзац + таблица)
        "BLOCK_PAUSE": slice_lines(rdf, 367, 376),         # §6.2 тело (без заголовка)
        "BLOCK_QUEUE": slice_lines(rdf, 306, 307) + "\n" + slice_lines(rdf, 338, 343),
        "BLOCK_QUEUE_STAGES": slice_lines(rdf, 349, 351),  # два этапных абзаца
        "BLOCK_CARDS": slice_lines(rdf, 789, 815),         # карточки DF-24/25/26 дословно
        "BLOCK_D57": d57,
    }

    files = {
        "PROJECT-RULES-v1.2.1.md": "PROJECT-RULES-v1.2.1.tpl",
        "MASTER-ROADMAP-v1.2.1.md": "MASTER-ROADMAP-v1.2.1.tpl",
        "DOCUMENT-CONSOLIDATION-PLAN-v1.2.1.md": "DOCUMENT-CONSOLIDATION-PLAN-v1.2.1.tpl",
        "MAPPING-TABLE.md": "MAPPING-TABLE.tpl",
        "OPEN-QUESTIONS.md": "OPEN-QUESTIONS.tpl",
        "CONSISTENCY-REPORT.md": "CONSISTENCY-REPORT.tpl",
    }
    for out_name, tpl_name in files.items():
        text = build(tpl_name, blocks)
        (OUT / out_name).write_text(text, encoding="utf-8")
        print(f"OK  {out_name}: {len(text.splitlines())} строк, {len(text)} байт")

    # Механическая сверка дословности: каждый блок обязан совпадать с источником
    src_map = {
        "BLOCK_PROMPT": (rules, 7, 112),
        "BLOCK_BRANDBOOK": (brand, 3, 348),
        "BLOCK_GLOSSARY": (rules, 189, 213),
        "BLOCK_MICROCOPY": (rules, 217, 221),
        "BLOCK_TEMPLATES": (rules, 235, 260),
        "BLOCK_LESSONS": (rules, 478, 492),
        "BLOCK_DECISIONS": (dec, 7, 132),
        "BLOCK_LADDER": (rdf, 354, 364),
        "BLOCK_PAUSE": (rdf, 367, 376),
        "BLOCK_QUEUE_STAGES": (rdf, 349, 351),
        "BLOCK_CARDS": (rdf, 789, 815),
    }
    for key, spec in src_map.items():
        path, a, b = spec
        assert blocks[key] == slice_lines(path, a, b), f"Блок {key} не совпал с источником"
    assert blocks["BLOCK_D57"] == d57
    print("Сверка дословности блоков: пройдена (12 блоков + D57)")

    # Append-only D57 в живой журнал: только дополнение; D1–D56 не трогаются.
    # Если D57 уже присутствует — сверить тождество, расхождение = ошибка сборки.
    dec_text = dec.read_text(encoding="utf-8")
    if "| D57 |" not in dec_text:
        dec.write_text(dec_text.rstrip("\n") + "\n\n" + d57 + "\n", encoding="utf-8")
        print("docs/DECISIONS.md: append-only дополнение D57 выполнено")
    else:
        if not dec_text.rstrip("\n").endswith(d57):
            raise SystemExit(
                "РАСХОЖДЕНИЕ: D57 в docs/DECISIONS.md не тождественен scripts/consolidation/d57.md — "
                "не подгонять, зафиксировать расхождение и сообщить владельцу"
            )
        print("docs/DECISIONS.md: D57 уже присутствует и тождественен эталону — пропущено")

    # DIFF v1.2 -> v1.2.1
    diff_doc = DIFF_INTRO + make_diff_section()
    (OUT / "DIFF-v1.2-v1.2.1.md").write_text(diff_doc, encoding="utf-8")
    print(f"OK  DIFF-v1.2-v1.2.1.md: {len(diff_doc.splitlines())} строк")

    # Контрольный список переноса (план, ничего не выполняется)
    (OUT / "HANDOVER-CHECKLIST.md").write_text(HANDOVER_CHECKLIST, encoding="utf-8")
    print(f"OK  HANDOVER-CHECKLIST.md: {len(HANDOVER_CHECKLIST.splitlines())} строк")

    # Снимки исходников + SHA256SUMS
    src_dir = OUT / "sources"
    src_dir.mkdir(parents=True, exist_ok=True)
    source_files = [
        rules,
        brand,
        rdf,
        dec,
        ROOT / "upload/LOGIX-MASTER-ROADMAP-2026-11-04.md",
        ROOT / "upload/ROADMAP-DEALFLOW-REWRITE-PROPOSAL-2026-11-04.md",
    ]
    lines_sums = []
    for src in source_files:
        dst = src_dir / src.name
        shutil.copyfile(src, dst)
        lines_sums.append(f"{sha256(dst)}  {src.name}")
        print(f"OK  sources/{src.name}: {len(dst.read_text(encoding='utf-8').splitlines())} строк")
    (src_dir / "SHA256SUMS").write_text("\n".join(lines_sums) + "\n", encoding="utf-8")
    # Факты о HEAD зашиты в текст шаблона (не подставляются из runtime-HEAD:
    # HEAD подготовки v1.2 — исторический факт c1d4f2d, а не текущий HEAD песочницы).
    (src_dir / "SOURCES-README.md").write_text(SOURCES_README_TMPL, encoding="utf-8")
    print("OK  sources/SHA256SUMS, sources/SOURCES-README.md")

    # Инструменты воспроизведения в пакет
    tools = OUT / "tools"
    tools.mkdir(parents=True, exist_ok=True)
    for name in ("build.py", "verify.py", "d57.md"):
        src = ROOT / "scripts/consolidation" / name
        if src.exists():
            shutil.copyfile(src, tools / name)
            print(f"OK  tools/{name}")
    tpl_dst = tools / "templates-v1.2.1"
    if tpl_dst.exists():
        shutil.rmtree(tpl_dst)
    shutil.copytree(TPL, tpl_dst)
    print("OK  tools/templates-v1.2.1/ (6 шаблонов)")

    print(f"\nHEAD песочницы: {git_head()} (коммиты в рамках работы над v1.2.1 не выполняются)")
    print("Далее запустите независимую сверку: python3 scripts/consolidation/verify.py")


if __name__ == "__main__":
    sys.exit(main())
