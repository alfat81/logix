#!/usr/bin/env python3
# DF-00B/DF-00D (G3): целостность проекта IC-01..IC-16 (docs/ROADMAP-DEALFLOW.md §4.7).
# python3 scripts/integrity_check.py                 — прогон против храповика (красный = релиз не собирается)
# python3 scripts/integrity_check.py --report-only   — все находки без сравнения с baseline (первичный снимок)
# python3 scripts/integrity_check.py --write-baseline — зафиксировать текущие находки как baseline
# Храповик: scripts/integrity-baseline.json (ключ + причина); рост baseline или устаревшие
# записи = красный. Baseline может только уменьшаться. Без внешних зависимостей.

import json
import os
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BASELINE_FILE = ROOT / "scripts" / "integrity-baseline.json"

VIOL: list[tuple[str, str, str]] = []  # (IC, key, detail)


def db_url_from_env_file() -> str:
    """DATABASE_URL: .env приоритетен (в песочнице шелл-переменная перекрыта),
    иначе — переменная окружения (CI-раннер: .env нет, берётся из job env)."""
    env_file = ROOT / ".env"
    if env_file.exists():
        m = re.search(r'^DATABASE_URL="?([^"\n]+)', env_file.read_text(encoding="utf-8"), re.M)
        if m:
            return m.group(1).strip()
    return os.environ.get("DATABASE_URL", "")


def sub_env() -> dict:
    """Окружение для prisma-субпроцессов с DATABASE_URL из .env."""
    url = db_url_from_env_file()
    e = dict(os.environ)
    if url:
        e["DATABASE_URL"] = url
    return e


def add(ic: str, key: str, detail: str = "") -> None:
    VIOL.append((ic, key, detail))


def rel(p: Path) -> str:
    return p.relative_to(ROOT).as_posix()


def rglob(glob: str) -> list[Path]:
    return sorted(ROOT.glob(glob))


def text(p: Path) -> str:
    return p.read_text(encoding="utf-8", errors="replace")


def strip_ts_comments(src: str) -> str:
    src = re.sub(r"\{/\*.*?\*/\}", "", src, flags=re.S)
    src = re.sub(r"/\*.*?\*/", "", src, flags=re.S)
    return "\n".join(l for l in src.splitlines() if not l.strip().startswith("//"))


# ── IC-01: prisma validate + расхождение схемы с миграциями ─────────────────
# Урок v0.6.7-fix1: молчаливый SKIP (regex не брал URL без пароля — а в .env
# песочницы как раз такой) спрятал дрейф RefItem.updatedAt от локального гейта;
# в CI проверка шла и поймала. SKIP теперь всегда с причиной в сводке.
ic01_skip: str = ""

def ic01() -> str:
    global ic01_skip
    try:
        subprocess.run(["bunx", "prisma", "validate"], cwd=ROOT, check=True,
                       capture_output=True, timeout=120, env=sub_env())
    except Exception as e:
        add("IC-01", "prisma-validate", f"prisma validate: {e}")
        return "FAIL"
    url = db_url_from_env_file()
    if not url:
        ic01_skip = "DATABASE_URL не задан"
        return "SKIP"
    m = re.match(r"(postgresql://[^/]+?)/(\w+)", url)
    if not m:
        ic01_skip = f"DATABASE_URL не postgresql ({url[:24]}…)"
        return "SKIP"
    shadow_url = f"{m.group(1)}/logix_ic_shadow"
    pg_url = f"{m.group(1)}/postgres"
    sh_env = dict(sub_env())
    sh_env["SHADOW_URL"] = pg_url
    # Если осталась от прошлого прогона — сносим, создаём заново
    subprocess.run(["bun", "scripts/shadow-db.ts", "drop"], cwd=ROOT,
                   capture_output=True, text=True, timeout=60, env=sh_env)
    r = subprocess.run(["bun", "scripts/shadow-db.ts", "create"], cwd=ROOT,
                       capture_output=True, text=True, timeout=60, env=sh_env)
    if r.returncode != 0:
        ic01_skip = "shadow-БД logix_ic_shadow не создалась (postgres недоступен?)"
        return "SKIP"
    try:
        d = subprocess.run(
            ["bunx", "prisma", "migrate", "diff", "--from-migrations", "prisma/migrations",
             "--to-schema-datamodel", "prisma/schema.prisma",
             "--shadow-database-url", shadow_url, "--exit-code"],
            cwd=ROOT, capture_output=True, text=True, timeout=120, env=sub_env())
        if d.returncode != 0 and d.stdout.strip():
            add("IC-01", "schema-migrations-diff",
                f"схема расходится с миграциями: {d.stdout.strip()[:300]}")
    finally:
        subprocess.run(["bun", "scripts/shadow-db.ts", "drop"], cwd=ROOT,
                       capture_output=True, text=True, timeout=60, env=sh_env)
    return "OK"


# ── IC-02: guard аутентификации у каждого роута ─────────────────────────────
CABINET_GUARD = {"admin": "requireEmployee", "client": "requireClient",
                 "broker": "requireBroker", "contractor": "requireContractor"}


def ic02() -> None:
    for f in rglob("src/app/api/**/route.ts"):
        r = rel(f)
        t = text(f)
        # r = src/app/api/<кабинет>/... — сегмент 3 в ПУТИ ФАЙЛА (без ведущего слэша)
        seg = r.split("/")[3] if r.count("/") >= 3 else ""
        if seg == "auth" or seg == "health" or "CRON_SECRET" in t:
            continue
        need = CABINET_GUARD.get(seg)
        guards = list(CABINET_GUARD.values()) + [
            "getCurrentEmployee", "getCurrentClient", "getCurrentBroker", "getCurrentContractor",
            # DF-17 (/api/ref/[dir]): роут для ТРЁХ кабинетов сразу — guard
            # собирает сессию любого кабинета нижнеуровневыми lookup'ами
            # (401 при отсутствии любой; e2e DF-17 проверяет анонима)
            "getEmployeeByToken", "getClientByToken", "getBrokerByToken", "getContractorByToken"]
        ok = (need and need in t) or (not need and any(g in t for g in guards))
        if not ok:
            add("IC-02", rel(f), f"роут без guard кабинета (ожидался {need or 'любой'})")


# ── IC-03: write-роут: { write: true } + событие или no-event ───────────────
def ic03() -> None:
    # { write: true } — маркер requireEmployee (P1-09); у портальных гвардов опций нет
    # («периметр один», client-auth.ts) — для них проверяем только событие/no-event.
    # DF-01 (G3): событие — через emitEvent (единственная точка записи,
    # lib/events.ts); logActivity — deprecated-обёртка замороженного контура
    # (D31), logInternalNote — заметки Ж3. Хелперы documents.ts пишут события
    # внутри (createDocumentOnDeal/deleteDocument), версии — в роуте через
    # addDocumentVersion/logDocumentVersionAdded. Делегирование patch.ts
    # (P1-22, лимит 300) событийно: patchLead/patchOrder зовут emitEvent.
    # Делегирование настроек (DF-00D): setSetting/resetSetting зовут emitEvent
    # внутри — инвариант держит IC-15 no-event (settings.ts без emitEvent = красный).
    event_call = (r"emitEvent\(|logActivity\(|logInternalNote\(|"
                  r"createDocumentOnDeal\(|addDocumentVersion\(|deleteDocument\(|"
                  r"patchLead\(|patchOrder\(|detachBrokerFromLead\(|detachBrokerFromOrder\(|"
                  r"setSetting\(|resetSetting\(")
    for f in rglob("src/app/api/**/route.ts"):
        t = text(f)
        url = rel(f)
        if re.search(r"^export (async )?function (POST|PATCH|PUT|DELETE)", t, re.M) is None:
            continue
        seg = url.split("/")[3] if url.count("/") >= 3 else ""
        if seg == "auth" or "CRON_SECRET" in t:
            continue
        if seg == "admin" and re.search(r"\{\s*[^{}]*?write:\s*true", t) is None:
            # Маркер ищем по месту в объекте опций, а не точной подстрокой:
            # master-only роуты передают { write: true, roles: [...] } (Ж6в, DF-00D) —
            # это тот же маркер P1-09; подстрока давала ложные FAIL (шесть записей
            # baseline сняты в v0.6.1). Сила гарда не снижена: write-роут без
            # write: true в опциях всё так же красный.
            add("IC-03", url + ":write", "admin write-роут без { write: true }")
        if not re.search(event_call, t) and "// no-event:" not in t:
            add("IC-03", url + ":event", "write-роут без события и без // no-event:")


# ── IC-04: типы событий — реестр ↔ создание ─────────────────────────────────
def ic04() -> None:
    act = ROOT / "src" / "lib" / "activity.ts"
    if not act.exists():
        add("IC-04", "registry-missing", "src/lib/activity.ts не найден")
        return
    t = text(act)
    m = re.search(r"export const ACTIVITY_TYPES = \[(.*?)\]", t, re.S)
    registry = set(re.findall(r"'([a-z][a-z0-9_]*)'", m.group(1))) if m else set()
    if not registry:
        add("IC-04", "registry-empty", "ACTIVITY_TYPES пуст")
        return
    created: set[str] = set()
    for f in rglob("src/**/*.ts*"):
        if f.name.endswith(".test.ts"):
            continue
        for lit in re.findall(r"""type:\s*['"]([a-z][a-z0-9_]+)['"]""", text(f)):
            if "_" in lit and lit != "type":
                created.add(lit)
    extra = created - registry
    for k in sorted(extra):
        add("IC-04", f"not-in-registry:{k}", "событие создаётся, но его нет в ACTIVITY_TYPES")
    # Использование по коду (без activity.ts) — тип реестра нигде не встречается
    body = "\n".join(text(f) for f in rglob("src/**/*.ts*") if f.name != "activity.ts")
    for k in sorted(registry):
        if k not in body:
            add("IC-04", f"unused:{k}", "тип из ACTIVITY_TYPES нигде не используется")
    # Матрица уведомлений появится в DF-03; её отсутствие не нарушение (см. карточку DF-00B)


# ── IC-05: статусы ↔ подписи ↔ бейджи ───────────────────────────────────────
TYPE_VALUES: dict[str, set[str]] = {}


CONST_ARRAYS: dict[str, set[str]] = {}


def collect_types() -> None:
    """Типы-объединения двух форм: inline union и (typeof CONST)[number]."""
    TYPE_VALUES.clear()
    CONST_ARRAYS.clear()
    for f in rglob("src/lib/*.ts"):
        t = text(f)
        for m in re.finditer(r"export type (\w+) =((?:\s*'?[\w |']*')+?)\s*(?:$|;)", t, re.M):
            vals = set(re.findall(r"'([\w-]+)'", m.group(2)))
            if vals:
                TYPE_VALUES[m.group(1)] = vals
        for m in re.finditer(r"export const (\w+) = \[(.*?)\]", t, re.S):
            vals = set(re.findall(r"'([\w-]+)'", m.group(2)))
            if vals:
                CONST_ARRAYS[m.group(1)] = vals
    for f in rglob("src/lib/*.ts"):
        for m in re.finditer(r"export type (\w+) = \(?typeof (\w+)\)?\[number\]", text(f)):
            if m.group(2) in CONST_ARRAYS:
                TYPE_VALUES[m.group(1)] = CONST_ARRAYS[m.group(2)]


def record_keys(t: str, name: str) -> set[str]:
    m = re.search(rf"export const {name}: Record<\w+[\w |]*, \w+> = \{{(.*?)\n\}}", t, re.S)
    if not m:
        m = re.search(rf"export const {name} = \{{(.*?)\n\}}", t, re.S)
    return set(re.findall(r"^\s*'?([\w-]+)'?\s*:", m.group(1), re.M)) if m else set()


def ic05() -> None:
    collect_types()
    libtexts = {f: text(f) for f in rglob("src/lib/*.ts")}
    labels: dict[str, tuple[str, set[str]]] = {}
    for f, t in libtexts.items():
        for name in re.findall(r"export const (\w*_LABELS): Record<(\w+),", t):
            keys = record_keys(t, name[0])
            labels[name[0]] = (name[1], keys)
    for name, (type_name, keys) in sorted(labels.items()):
        tv = TYPE_VALUES.get(type_name)
        if tv is None:
            continue
        for k in sorted(keys - tv):
            add("IC-05", f"{name}:{k}", "подпись без значения типа")
        for k in sorted(tv - keys):
            add("IC-05", f"{name}:{k}", "значение типа без подписи")
    badges: dict[str, set[str]] = {}
    for f, t in libtexts.items():
        for name in re.findall(r"export const (\w*_BADGE_VARIANTS): Record<(\w+),", t):
            badges[name[1]] = record_keys(t, name[0])
    for name, (type_name, keys) in sorted(labels.items()):
        if name.endswith("_STATUS_LABELS") and type_name in badges:
            for k in sorted(keys - badges[type_name]):
                add("IC-05", f"badge:{type_name}:{k}", "статус без варианта бейджа")


# ── IC-06: переменные окружения ─────────────────────────────────────────────
SKIP_ENV = {"NODE_ENV"}


def env_usage() -> tuple[dict[str, set[str]], set[str], set[str]]:
    used: dict[str, set[str]] = {}
    files = rglob("src/**/*.ts*") + rglob("scripts/*.ts") + \
        rglob("scripts/*.mjs") + rglob("scripts/*.py")
    for f in files:
        t = text(f)
        names = set(re.findall(r"process\.env\.([A-Z_][A-Z0-9_]*)", t))
        if f.suffix == ".py":
            names |= set(re.findall(r"os\.environ(?:\.get)?[\[(]\s*['\"]([A-Z_][A-Z0-9_]*)", t))
        for n in names:
            used.setdefault(n, set()).add(rel(f))
    ex = ROOT / ".env.example"
    ex_keys = set(re.findall(r"^([A-Z_][A-Z0-9_]*)=", text(ex), re.M)) if ex.exists() else set()
    dep = ROOT / "DEPLOY.md"
    dep_keys = set(re.findall(r"\b([A-Z_][A-Z0-9_]{2,})\b", text(dep))) if dep.exists() else set()
    return used, ex_keys, dep_keys


def ic06() -> None:
    used, ex_keys, dep_keys = env_usage()
    for n in sorted(set(used) - SKIP_ENV):
        if n not in ex_keys:
            add("IC-06", f"not-in-example:{n}", f"используется ({len(used[n])} файл.) но нет в .env.example")
        if n not in dep_keys:
            add("IC-06", f"not-in-deploy:{n}", f"используется ({len(used[n])} файл.) но нет в DEPLOY.md")
    for n in sorted(ex_keys - set(used)):
        add("IC-06", f"unused:{n}", "описана в .env.example, но не используется в коде")


# ── IC-07: версия в трёх местах + релизные файлы ────────────────────────────
def ic07() -> None:
    pkg = json.loads(text(ROOT / "package.json")).get("version", "")
    ch = text(ROOT / "CHANGELOG.md")
    m = re.search(r"^## \[([\d.]+)\]", ch, re.M)
    ch_ver = m.group(1) if m else "?"
    rm = text(ROOT / "docs" / "ROADMAP.md")
    m = re.search(r"Релизный архив: \*\*v([\d.]+)\*\*", rm)
    rm_ver = m.group(1) if m else "?"
    for name, v in (("package.json", pkg), ("CHANGELOG", ch_ver), ("ROADMAP-статус", rm_ver)):
        if v != pkg:
            add("IC-07", name, f"версия {v} ≠ package.json {pkg}")
    for kind in ("RELEASE-NOTES", "RELEASE-INSTRUCTIONS"):
        if not (ROOT / "docs" / "releases" / f"{kind}-v{pkg}.md").exists():
            add("IC-07", kind, f"{kind}-v{pkg}.md отсутствует")


# ── IC-08: ссылки в документах на существующие пути ─────────────────────────
# Пути из будущих карточек (плановые ссылки ROADMAP-DEALFLOW) — не нарушение.
# Список храповиком: путь с появлением файла уходит отсюда (v0.6.1: events.ts,
# audience.ts, events-guard.test.ts, settings.ts стали существующими; r2-вариант
# исчез из канона 1.4 вместе со ссылкой — «r2 ВРЕМЕННО» закрыто).
PLANNED = {"src/lib/participants.ts", "src/lib/notifications",
           "src/lib/brand.ts",
           "scripts/pulse_check.py", "scripts/check-format-dupes.sh",
           "scripts/migrate-files-to-storage.ts"}
# DF-02A v0.6.2: company-users.ts появился в Блоке 2, actor-name.ts —
# в Блоке 4 (храповик сработал — пути убраны).


def ic08() -> None:
    docs = [p for p in rglob("docs/**/*.md") if "archive" not in p.parts] + \
        [ROOT / "README.md"]
    for f in docs:
        if not f.exists():
            continue
        # IC-08 проверяет ССЫЛКИ в прозе. Команды в fenced-блоках релизных
        # инструкций (например git rm удаляемого в этом же релизе файла) —
        # не ссылки: владелец их выполняет, а не переходит по ним (v0.5.4).
        body = re.sub(r"```.*?```", "", text(f), flags=re.S)
        for ref in re.findall(r"`((?:src|docs|scripts|prisma)/[\w@./\-]+)`", body):
            if any(bad in ref for bad in ("{", "*", "<", "X.Y.Z", "vX", "…")):
                continue
            if any(ref == p or ref.startswith(p + "/") for p in PLANNED):
                continue
            if not (ROOT / ref).exists():
                add("IC-08", f"{rel(f)}->{ref}", "ссылка на несуществующий файл")


# ── IC-09: размеры, hex, эмодзи, деньги ─────────────────────────────────────
EMOJI = re.compile(r"[\U0001F300-\U0001FAFF\u2600-\u27BF\u2B00-\u2BFF\uFE0F]")
HEX = re.compile(r"#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b")


def ic09() -> None:
    for f in rglob("src/**/*.ts*"):
        if f.name.endswith(".test.ts"):
            continue
        r = rel(f)
        # RULES 2.14 в редакции v0.5.0: ≤300 — компоненты и роуты; src/lib вне скоупа
        # (зафиксировано в NOTES v0.5.0, ROADMAP P1-22)
        if not r.startswith("src/lib/"):
            n = len(text(f).splitlines())
            if n > 300:
                add("IC-09", f"lines:{r}", f"{n} строк (> 300, RULES 2.14)")
        if f.name != "globals.css" or f.suffix == ".ts":
            for m in HEX.finditer(text(f)):
                add("IC-09", f"hex:{r}", f"hex-цвет {m.group(0)} вне globals.css")
                break
        if f.suffix == ".tsx" and EMOJI.search(text(f)):
            add("IC-09", f"emoji:{r}", "эмодзи в UI")
        # только денежные форматы: toLocaleString с currency/₽/руб и Intl.NumberFormat;
        # toLocaleString у дат (dateStyle) и toFixed размеров файлов — не деньги
        t = text(f)
        for m in re.finditer(r"toLocaleString\([^)]{0,120}\)", t):
            if re.search(r"currency|₽|руб", m.group(0)):
                add("IC-09", f"money:{r}", "форматирование денег мимо money.ts (RULES 2.15)")
                break
        if "Intl.NumberFormat" in t and f.name != "money.ts":
            add("IC-09", f"money:{r}", "Intl.NumberFormat мимо money.ts (RULES 2.15)")


# ── IC-10: запрещённые строки ───────────────────────────────────────────────
def ic10() -> None:
    self_abs = Path(__file__).resolve()
    for f in rglob("src/**/*") + rglob("scripts/*") + [ROOT / "prisma" / "schema.prisma"]:
        if not f.is_file() or f.suffix not in (".ts", ".tsx", ".css", ".py", ".mjs", ".prisma"):
            continue
        if f.resolve() == self_abs:
            continue  # сам инструмент перечисляет запрещённые строки в docstring
        t = text(f)
        if "APEX" in t:  # регистрозначимо: бренд — верхним регистром; apex_* идентификаторы не упоминание
            add("IC-10", f"apex:{rel(f)}", "упоминание APEX (IC-10)")
        if "LOGISTICS-TASK-QUEUE" in t:
            add("IC-10", f"queue:{rel(f)}", "ссылка на LOGISTICS-TASK-QUEUE.md")
    for f in rglob("src/**/*.tsx"):
        clean = strip_ts_comments(text(f))
        if re.search(r"[Лл]ид", clean):
            add("IC-10", f"lid:{rel(f)}", "слово «лид» вне комментариев (D27)")
    if not (ROOT / "src" / "lib" / "brand.ts").exists():
        add("IC-10", "brand-missing", "brand.ts отсутствует — хардкод названия не проверяется")


# ── IC-11: [ЦЕЛЬ] у закрытых задач; закрытая задача ↔ проверка ──────────────
def ic11() -> None:
    rm = text(ROOT / "docs" / "ROADMAP.md")
    closed = set(re.findall(r"\b(P1-\d+)\b[^|\n]*✅", rm))
    e2e = ROOT / "scripts" / "e2e_api_test.py"
    if not e2e.exists():
        add("IC-11", "e2e-missing", "scripts/e2e_api_test.py не найден")
        return
    t = text(e2e)
    for tid in sorted(re.findall(r"\[ЦЕЛЬ (\w+-\w+)\]", t)):
        if tid in closed:
            add("IC-11", f"target-closed:{tid}", "[ЦЕЛЬ] у закрытой задачи — перевести в штатную проверку")
    for tid in sorted(closed):
        if tid not in t:
            add("IC-11", f"no-check:{tid}", "закрытая задача без упоминания в e2e")


# ── IC-12: INVENTORY.md и DEPRECATIONS.md ───────────────────────────────────
def ic12() -> None:
    r = subprocess.run([sys.executable, str(ROOT / "scripts" / "inventory.py"), "--check"],
                       cwd=ROOT, capture_output=True, text=True, timeout=120)
    if r.returncode != 0:
        add("IC-12", "inventory-stale", "docs/INVENTORY.md не соответствует коду")
    dep = ROOT / "docs" / "DEPRECATIONS.md"
    if not dep.exists():
        add("IC-12", "deprecations-missing", "docs/DEPRECATIONS.md отсутствует")
        return
    t = text(dep)
    if "| Что | Чем заменено | Почему оставлено | Версия удаления | Как проверить |" not in t:
        add("IC-12", "deprecations-format", "шапка таблицы DEPRECATIONS.md не по формату")
        return
    for i, line in enumerate(l for l in t.splitlines() if l.startswith("|") and "---" not in l and "Что |" not in l):
        if not re.search(r"\d+\.\d+\.\d+", line):
            add("IC-12", f"deprecations-row{i}", f"строка без версии удаления: {line[:80]}")


# ── IC-13: охранные vitest-тесты на месте ───────────────────────────────────
REQUIRED_TESTS = {
    "src/lib/permissions-guard.test.ts": "поиск write-роутов без опций (DF-00)",
    "src/lib/password.test.ts": "пароли без plaintext",
    "src/lib/status-machine.test.ts": "машина статусов",
    "src/lib/events-guard.test.ts": "охрана событий (появится в DF-01)",
}


def ic13() -> None:
    for path, why in REQUIRED_TESTS.items():
        if not (ROOT / path).exists():
            add("IC-13", path, f"охранный тест отсутствует ({why}); сам прогон — bun run test")


# ── IC-15: настройки (D32) — реестр без хардкода бизнес-параметров ──────────
# Определение §4.7 G3: бизнес-параметры (время HH:MM, часовой пояс, лимиты,
# пороги, адреса отправителя) не заданы литералами вне lib/settings.ts;
# каждый ключ реестра имеет значение по умолчанию, подпись и валидатор;
# каждый ключ показан на экране настроек; изменения настроек пишутся в журнал.
SETTINGS_FILE = "src/lib/settings.ts"
SETTINGS_API = "src/app/api/admin/settings/route.ts"
SETTINGS_PAGE = "src/app/admin/(dashboard)/settings/page.tsx"
SETTINGS_PANEL = "src/components/admin/SettingsPanel.tsx"
# Целостная строка-литерал = значение параметра. Частичное совпадение не счёт:
# подписи и подсказки вправе упоминать «09:00» в прозе, ISO-суффикс 'T00:00:00'
# в дате — не бизнес-время, а placeholder — пример формата для человека.
TIME_LIT = re.compile(r"^([01]?\d|2[0-3]):([0-5]\d)$")
TZ_LIT = re.compile(r"^(?:Africa|America|Antarctica|Asia|Atlantic|Australia|Europe|Indian|Pacific)/[\w+\-]+(?:/[\w+\-]+)?$")
EMAIL_LIT = re.compile(r"^[\w.+\-]+@[\w\-]+\.[\w.\-]{2,}$")
# Прямая запись Setting мимо setSetting/resetSetting — без события журнала.
DIRECT_WRITE = re.compile(r"\.setting\.(?:upsert|create|createMany|update|updateMany|delete|deleteMany)\b")


def quoted_strings(code: str) -> list[str]:
    out = []
    for m in re.finditer(r"'([^'\n]*)'|\"([^\"\n]*)\"", code):
        s = m.group(1) if m.group(1) is not None else m.group(2)
        if s:
            out.append(s)
    return out


def business_literals(code: str) -> list[tuple[str, str]]:
    """(вид, литерал): время/пояс/адрес, заданные ЦЕЛОЙ строкой-литералом."""
    code = re.sub(r'placeholder="[^"]*"', "", code)   # подсказка ввода — пример формата
    code = re.sub(r"placeholder=\{[^{}]*\}", "", code)  # ...и в JSX-выражении
    code = strip_ts_comments(code)
    hits: list[tuple[str, str]] = []
    for s in quoted_strings(code):
        if TIME_LIT.match(s):
            hits.append(("time", s))
        elif TZ_LIT.match(s):
            hits.append(("tz", s))
        elif EMAIL_LIT.match(s):
            hits.append(("email", s))
    return hits


def parse_setting_blocks(t: str) -> list[str]:
    """Тела defineSetting({...}) с подсчётом скобок (внутри бывают скобки валидаторов)."""
    blocks: list[str] = []
    i = 0
    while True:
        s = t.find("defineSetting({", i)
        if s < 0:
            return blocks
        depth = 0
        for j in range(s + len("defineSetting("), len(t)):
            c = t[j]
            if c == "{":
                depth += 1
            elif c == "}":
                depth -= 1
                if depth == 0:
                    blocks.append(t[s:j + 1])
                    i = j + 1
                    break
        else:
            return blocks


def ic15_registry() -> list[str]:
    """Каждый ключ реестра — с дефолтом, подписью и валидатором. Возвращает ключи."""
    f = ROOT / SETTINGS_FILE
    if not f.exists():
        add("IC-15", "registry-missing", f"{SETTINGS_FILE} не найден")
        return []
    blocks = parse_setting_blocks(text(f))
    if not blocks:
        add("IC-15", "registry-empty", "реестр SETTINGS пуст")
        return []
    keys: list[str] = []
    for n, b in enumerate(blocks, 1):
        mk = re.search(r"key:\s*'([\w.]+)'", b)
        if not mk:
            add("IC-15", f"registry:entry-{n}", "ключ defineSetting не найден")
            continue
        k = mk.group(1)
        keys.append(k)
        if not re.search(r"label:\s*'[^']+'", b):
            add("IC-15", f"registry:label:{k}", "нет подписи экрана")
        if "defaultValue:" not in b:
            add("IC-15", f"registry:default:{k}", "нет значения по умолчанию")
        if "validate:" not in b:
            add("IC-15", f"registry:validate:{k}", "нет валидатора")
    return keys


def ic15_screen(keys: list[str]) -> None:
    """Каждый ключ показан на экране: API отдаёт реестр целиком (SETTINGS.map),
    панель рендерит общий список — ключ конкретной настройки вшит быть не может."""
    api = ROOT / SETTINGS_API
    if not api.exists():
        add("IC-15", "api-missing", f"{SETTINGS_API} не найден")
    elif "SETTINGS.map(" not in text(api):
        add("IC-15", "api-not-generic", "GET отдаёт не весь реестр (ожидался SETTINGS.map)")
    page = ROOT / SETTINGS_PAGE
    if not page.exists():
        add("IC-15", "screen-missing", f"{SETTINGS_PAGE} не найден")
    elif "SettingsPanel" not in text(page):
        add("IC-15", "screen-no-panel", "экран не рендерит SettingsPanel")
    panel = ROOT / SETTINGS_PANEL
    if not panel.exists():
        add("IC-15", "panel-missing", f"{SETTINGS_PANEL} не найден")
        return
    pt = strip_ts_comments(text(panel))
    for k in keys:
        if f"'{k}'" in pt or f'"{k}"' in pt:
            add("IC-15", f"screen-hardcoded:{k}",
                "ключ вшит в панель — рендер обязан быть общим (по uiType)")


def ic15_journal() -> None:
    """Изменения настроек пишутся в журнал: запись Setting — только через
    setSetting/resetSetting (emitEvent внутри), событие — в ACTIVITY_TYPES."""
    for f in rglob("src/**/*.ts*"):
        if f.name.endswith(".test.ts") or rel(f) == SETTINGS_FILE:
            continue
        if DIRECT_WRITE.search(text(f)):
            add("IC-15", f"direct-write:{rel(f)}", "запись Setting мимо setSetting/resetSetting (без события)")
    act = ROOT / "src" / "lib" / "activity.ts"
    if not act.exists() or "'setting_changed'" not in text(act):
        add("IC-15", "event-not-in-registry", "setting_changed отсутствует в ACTIVITY_TYPES")
    st = ROOT / SETTINGS_FILE
    if st.exists() and "emitEvent(" not in text(st):
        add("IC-15", "no-event", "setSetting/resetSetting без emitEvent — журнал не пишется")


def ic15() -> None:
    keys = ic15_registry()
    for f in rglob("src/**/*.ts*"):
        if f.name.endswith(".test.ts") or rel(f) == SETTINGS_FILE:
            continue
        # DF-17 (lib/cbr.ts): «Europe/Moscow» — свойство ИСТОЧНИКА курсов
        # (Банк России публикует по московскому дню), не бизнес-настройка;
        # зафиксировано в docs/REFERENCES-SOURCES.md — не выносится в реестр.
        if rel(f) == "src/lib/cbr.ts":
            continue
        for kind, lit in business_literals(text(f)):
            add("IC-15", f"{kind}:{rel(f)}", f"бизнес-параметр {lit!r} литералом вне реестра (перенесите в SETTINGS)")
    ic15_screen(keys)
    ic15_journal()


# ── IC-14: дубликаты определений и блоков ≥ 12 строк ────────────────────────
def ic14() -> None:
    names: dict[str, set[str]] = {}
    for f in rglob("src/lib/*.ts"):
        if f.name.endswith(".test.ts"):
            continue
        for n in re.findall(r"^export (?:default )?(?:async )?(?:function|const|type|class) (\w+)",
                            text(f), re.M):
            names.setdefault(n, set()).add(rel(f))
    for n in sorted(f for f, s in names.items() if len(s) > 1):
        add("IC-14", f"export:{n}", "экспорт с одинаковым именем: " + ", ".join(sorted(names[n])))
    windows: dict[str, set[str]] = {}
    for f in rglob("src/**/*.ts*"):
        if f.name.endswith(".test.ts"):
            continue
        lines = [l.strip() for l in text(f).splitlines()
                 if l.strip() and not l.strip().startswith(("//", "*", "/*"))]
        for i in range(len(lines) - 11):
            h = hash("\n".join(lines[i:i + 12]))
            windows.setdefault(str(h), set()).add(rel(f))
    pairs = set()
    for h, fs in windows.items():
        if len(fs) > 1:
            fl = sorted(fs)
            for i in range(len(fl)):
                for j in range(i + 1, len(fl)):
                    pairs.add((fl[i], fl[j]))
    for a, b in sorted(pairs):
        add("IC-14", f"block:{a}~{b}", "дубликат блока ≥ 12 строк")


# ── IC-16: справочники (D37) — без перечней в коде, источники описаны ───────
# Определение §4.7: поля с кодами (страна, валюта, Инкотермс, упаковка, ТН ВЭД,
# место) в формах выбираются только через Combobox справочника (живой выбор
# держит валидация API через resolveActiveRefs + e2e DF-17); в коде НЕТ
# перечней стран, валют, упаковки и условий поставки литералами; для каждого
# справочника есть запись об источнике и условиях использования.
REF_LIB = "src/lib/ref.ts"
SOURCES_FILE = "docs/REFERENCES-SOURCES.md"
# Пороги ВЫШЕ разрешённых запасов карточки DF-17: запасная ЧЕТВЁРКА валют в
# money.ts (случай пустой таблицы) и единичные упоминания терминов — не перечни.
INCOTERM_CODES = {"EXW", "FCA", "CPT", "CIP", "DAP", "DPU", "DDP", "FAS", "FOB", "CFR", "CIF", "DAT"}
INCOTERM_THRESHOLD = 3
CURRENCY_CODES = {"RUB", "USD", "EUR", "CNY", "KZT", "BYN", "UAH", "UZS", "KGS", "TJS", "TMT", "AZN", "AMD", "GEL", "TRY", "AED", "GBP", "CHF", "JPY", "KRW", "HKD", "SGD", "INR", "THB", "VND", "IDR", "MYR", "PLN", "CZK", "SEK", "NOK", "DKK"}
CURRENCY_THRESHOLD = 7
# Формат строк данных сида стран ('CC|CCC|NNN') — в src его быть не должно.
COUNTRY_ROW = re.compile(r"^['\"][A-Z]{2}\|[A-Z]{3}\|\d{3}['\"],?$")


def ic16() -> None:
    ref_dirs: list[str] = []
    rf = ROOT / REF_LIB
    if rf.exists():
        m = re.search(r"REF_DIRS\s*=\s*\[([^\]]*)\]", text(rf))
        if m:
            ref_dirs = re.findall(r"'(\w+)'", m.group(1))
    else:
        add("IC-16", "lib-missing", f"{REF_LIB} не найден")
    src_doc = ROOT / SOURCES_FILE
    if not src_doc.exists():
        add("IC-16", "sources-missing", f"{SOURCES_FILE} отсутствует — каждый справочник обязан иметь запись об источнике и условиях использования")
    else:
        st = text(src_doc)
        for d in ref_dirs:
            if not re.search(rf"^##\s+{d}\b", st, re.M):
                add("IC-16", f"sources:{d}", f"нет записи об источнике для dir={d} в {SOURCES_FILE}")
        if "CurrencyRate" not in st and "Курсы ЦБ" not in st:
            add("IC-16", "sources:currency-rate", "нет записи об источнике курсов ЦБ РФ (CurrencyRate)")
    for f in rglob("src/**/*.ts*"):
        if f.name.endswith(".test.ts"):
            continue
        raw = text(f)
        code = strip_ts_comments(raw)
        inct = {s for s in quoted_strings(code) if s in INCOTERM_CODES}
        if len(inct) >= INCOTERM_THRESHOLD:
            add("IC-16", f"incoterm:{rel(f)}", f"перечень условий поставки литералами ({len(inct)}): выбирайте из справочника /api/ref/incoterm")
        cur = {s for s in quoted_strings(code) if s in CURRENCY_CODES}
        if len(cur) >= CURRENCY_THRESHOLD:
            add("IC-16", f"currency:{rel(f)}", f"перечень валют литералами ({len(cur)}): справочник /api/ref/currency; запасной список — только money.ts")
        rows = [l.strip() for l in raw.splitlines() if COUNTRY_ROW.match(l.strip())]
        if len(rows) >= 5:
            add("IC-16", f"country:{rel(f)}", "перечень стран (формат сида) в коде: данные — scripts/ref-data/countries.ts + сид")


CHECKS = [
    ("IC-01", lambda: ic01()),
    ("IC-02", ic02), ("IC-03", ic03), ("IC-04", ic04), ("IC-05", ic05),
    ("IC-06", ic06), ("IC-07", ic07), ("IC-08", ic08), ("IC-09", ic09),
    ("IC-10", ic10), ("IC-11", ic11), ("IC-12", ic12), ("IC-13", ic13),
    ("IC-14", ic14), ("IC-15", ic15), ("IC-16", ic16),
]


def main() -> None:
    args = sys.argv[1:]
    report_only = "--report-only" in args
    write_baseline = "--write-baseline" in args
    ic01_status = ic01()  # первый — с subprocess, результат печатаем отдельно
    for ic, fn in CHECKS[1:]:
        fn()

    by_ic: dict[str, list] = {}
    for ic, key, detail in VIOL:
        by_ic.setdefault(ic, []).append((key, detail))

    baseline: dict = {}
    if not report_only and BASELINE_FILE.exists():
        baseline = json.loads(BASELINE_FILE.read_text(encoding="utf-8"))

    new_viol, stale = [], []
    for ic in sorted(set(list(by_ic) + list(baseline))):
        entries = by_ic.get(ic, [])
        base_keys = {e["key"] for e in baseline.get(ic, [])}
        for key, detail in entries:
            if baseline and key not in base_keys:
                new_viol.append((ic, key, detail))
        for bk in sorted(base_keys - {k for k, _ in entries}):
            stale.append((ic, bk))

    print(f"IC-01 {ic01_status} (prisma validate + migrate diff)")
    if ic01_status == "SKIP":
        print(f"ВНИМАНИЕ: IC-01 SKIP — {ic01_skip}; дрейф схема↔миграции НЕ проверялся")
    for ic in [c for c, _ in CHECKS[1:]]:
        n = len(by_ic.get(ic, []))
        print(f"{ic} {'PASS' if n == 0 else 'FAIL'} ({n})")
    if report_only or write_baseline:
        for ic, key, detail in VIOL:
            print(f"  {ic}\t{key}\t{detail}")
        if write_baseline:
            out: dict[str, list] = {}
            for ic, key, detail in VIOL:
                out.setdefault(ic, []).append({"key": key, "reason": "первичный baseline DF-00B"})
            BASELINE_FILE.write_text(json.dumps(out, indent=1, ensure_ascii=False), encoding="utf-8")
            print(f"baseline записан: {sum(len(v) for v in out.values())} записей")
        sys.exit(0)

    for ic, key, detail in new_viol:
        print(f"NEW  {ic}\t{key}\t{detail}")
    for ic, key in stale:
        print(f"STALE {ic}\t{key}\t(нарушение устранено — уберите запись из baseline)")
    total = len(new_viol) + len(stale)
    print(f"Итог: {'OK' if total == 0 else f'FAIL ({total})'}: новых {len(new_viol)}, устаревших baseline {len(stale)}")
    sys.exit(1 if total else 0)


if __name__ == "__main__":
    main()
