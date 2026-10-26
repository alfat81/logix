#!/usr/bin/env python3
# DF-00B (G1): генератор docs/INVENTORY.md — индекс существующих инструментов проекта.
# Файл генерируемый, руками не правится. Без внешних зависимостей (только stdlib).
# Запуск: python3 scripts/inventory.py           — перегенерировать docs/INVENTORY.md
#         python3 scripts/inventory.py --check   — выйти с кодом 1, если файл устарел (IC-12, CI)

import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "docs" / "INVENTORY.md"

HEADER = """<!-- Автогенерируемый файл (scripts/inventory.py, DF-00B). Руками не править. -->
<!-- Регенерация: python3 scripts/inventory.py; расхождение с кодом ловит IC-12 и CI. -->

# INVENTORY — индекс инструментов проекта

Назначение (гейт G1, docs/ROADMAP-DEALFLOW.md §4.7): перед созданием нового хелпера,
компонента, роута или скрипта проверить здесь и в коде, что аналога ещё нет.
Подробности — docs/RULES.md (2.13 reuse-first).
"""


def list_files(pattern: str) -> list[Path]:
    return sorted(ROOT.glob(pattern))


def rel(p: Path) -> str:
    return p.relative_to(ROOT).as_posix()


def first_comment(lines: list[str], idx: int) -> str:
    """Первая содержательная строка комментария непосредственно над декларацией."""
    out = ""
    j = idx - 1
    while j >= 0:
        s = lines[j].strip()
        if s.startswith("//"):
            out = s.lstrip("/").strip()
            j -= 1
            continue
        if s.endswith("*/"):
            k = j
            while k >= 0 and not lines[k].strip().startswith("/*"):
                k -= 1
            if k >= 0:
                body = lines[k].strip().lstrip("/*").strip()
                if body.startswith("*"):
                    body = body[1:].strip()
                out = body
            break
        break
    return out[:160]


def lib_exports() -> list[tuple[str, str, str]]:
    rows = []
    pat = re.compile(
        r"^export (?:default )?(?:async )?(function|const|type|interface|class) (\w+)"
    )
    for f in list_files("src/lib/**/*.ts"):
        if f.name.endswith(".test.ts"):
            continue
        lines = f.read_text(encoding="utf-8").splitlines()
        for i, line in enumerate(lines):
            m = pat.match(line)
            if m:
                rows.append((m.group(2), rel(f), first_comment(lines, i)))
    return sorted(rows)


def components() -> dict[str, list[tuple[str, str]]]:
    groups: dict[str, list[tuple[str, str]]] = {}
    pat = re.compile(
        r"^export (?:default )?(?:async )?function (\w+)|^export const (\w+) ?[:=]"
    )
    for f in list_files("src/components/**/*.tsx"):
        group = f.parent.name if f.parent.name in ("admin", "broker", "client",
            "contractor", "documents", "ui") else f.parent.parent.name
        name = f.stem
        lines = f.read_text(encoding="utf-8").splitlines()
        for line in lines:
            m = pat.match(line)
            if m:
                name = m.group(1) or m.group(2)
                break
        groups.setdefault(group, []).append((name, rel(f)))
    for g in groups:
        groups[g].sort()
    return dict(sorted(groups.items()))


def api_routes() -> list[tuple[str, str, str, str, str, str]]:
    guards = {
        "requireEmployee": "employee",
        "requireClient": "client",
        "requireBroker": "broker",
        "requireContractor": "contractor",
    }
    rows = []
    for f in list_files("src/app/api/**/route.ts"):
        text = f.read_text(encoding="utf-8")
        url = "/" + rel(f).replace("src/app/", "").replace("/route.ts", "")
        url = re.sub(r"\[([^\]]+)\]", r"{\1}", url)
        methods = sorted(set(re.findall(
            r"^export (?:async )?function (GET|POST|PATCH|PUT|DELETE)", text, re.M)))
        # сегмент кабинета: src/app/api/<сегмент>/... — индекс 3 пути файла
        seg = rel(f).split("/")[3] if rel(f).count("/") >= 3 else ""
        cabinet = {"admin": "admin", "client": "client", "broker": "broker",
                   "contractor": "contractor", "auth": "auth"}.get(seg, "public")
        found = sorted({guards[m] for m in guards if m in text})
        guard = ", ".join(found) if found else "—"
        write = "write" if "{ write: true }" in text else ""
        event = "да" if re.search(r"db\.activity\.create|createActivity", text) else "нет"
        rows.append((", ".join(methods) or "—", url, cabinet, guard, write, event))
    return sorted(rows, key=lambda r: r[1])


def prisma_models() -> list[tuple[str, int, str]]:
    schema_file = ROOT / "prisma" / "schema.prisma"
    if not schema_file.exists():
        return []
    schema = schema_file.read_text(encoding="utf-8")
    models = re.findall(r"^model (\w+) \{", schema, re.M)
    camel = lambda m: m[0].lower() + m[1:]
    usage: dict[str, set[str]] = {}
    files = list_files("src/**/*.ts") + list_files("src/**/*.tsx") + list_files("scripts/*.ts")
    for f in files:
        if f.name.endswith(".test.ts"):
            continue
        text = f.read_text(encoding="utf-8")
        for m in models:
            if re.search(rf"\b(?:db|prisma)\.{camel(m)}\.", text):
                usage.setdefault(m, set()).add(rel(f))
    rows = []
    for m in sorted(models):
        block = re.search(rf"^model {m} \{{(.*?)^\}}", schema, re.M | re.S)
        n = 0
        if block:
            n = sum(1 for l in block.group(1).splitlines()
                    if l.strip() and not l.strip().startswith("//")
                    and re.match(r"^\s*\w+\s", l))
        u = sorted(usage.get(m, []))
        shown = ", ".join(u[:6]) + (f" (+{len(u)-6})" if len(u) > 6 else "")
        rows.append((m, n, shown or "—"))
    return rows


def env_vars() -> list[tuple[str, str, str, str]]:
    used: dict[str, set[str]] = {}
    files = list_files("src/**/*.ts") + list_files("src/**/*.tsx") + \
        list_files("scripts/*.ts") + list_files("scripts/*.mjs") + list_files("scripts/*.py")
    for f in files:
        text = f.read_text(encoding="utf-8")
        names = set(re.findall(r"process\.env\.([A-Z_][A-Z0-9_]*)", text))
        if f.suffix == ".py":
            names |= set(re.findall(r"os\.environ(?:\.get)?[\[(]\s*['\"]([A-Z_][A-Z0-9_]*)", text))
        for name in names:
            used.setdefault(name, set()).add(rel(f))
    ex_keys, dep_keys = set(), set()
    ex = ROOT / ".env.example"
    dep = ROOT / "DEPLOY.md"
    if ex.exists():
        ex_keys = set(re.findall(r"^([A-Z_][A-Z0-9_]*)=", ex.read_text(encoding="utf-8"), re.M))
    if dep.exists():
        dep_keys = set(re.findall(r"\b([A-Z_][A-Z0-9_]{2,})\b", dep.read_text(encoding="utf-8")))
    all_names = sorted(set(used) | ex_keys)
    rows = []
    for n in all_names:
        u = sorted(used.get(n, []))
        rows.append((n, f"{len(u)}", "да" if n in ex_keys else "—",
                     "да" if n in dep_keys else "—"))
    return rows


def package_scripts() -> list[tuple[str, str]]:
    pkg = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
    return sorted(pkg.get("scripts", {}).items())


def build_md() -> str:
    parts = [HEADER, ""]

    parts += ["## Экспорты src/lib", "",
              "| Экспорт | Файл | Назначение (первая строка комментария) |",
              "|---|---|---|"]
    for name, file, note in lib_exports():
        parts.append(f"| `{name}` | `{file}` | {note or '—'} |")
    parts.append("")

    parts += ["## Компоненты", ""]
    for group, items in components().items():
        parts += [f"### src/components/{group}", "",
                  "| Компонент | Файл |", "|---|---|"]
        for name, file in items:
            parts.append(f"| `{name}` | `{file}` |")
        parts.append("")

    parts += ["## Роуты API", "",
              "| Методы | Путь | Кабинет | Guard | Write | Событие |",
              "|---|---|---|---|---|---|"]
    for methods, url, cab, guard, write, event in api_routes():
        parts.append(f"| {methods} | `{url}` | {cab} | {guard} | {write or '—'} | {event} |")
    parts.append("")

    parts += ["## Модели Prisma", "",
              "| Модель | Полей | Где используется |", "|---|---|---|"]
    for m, n, u in prisma_models():
        parts.append(f"| `{m}` | {n} | {u} |")
    parts.append("")

    parts += ["## Переменные окружения", "",
              "| Переменная | Файлов с использованием | .env.example | DEPLOY.md |",
              "|---|---|---|---|"]
    for n, cnt, ex, dep in env_vars():
        parts.append(f"| `{n}` | {cnt} | {ex} | {dep} |")
    parts.append("")

    parts += ["## Скрипты package.json", "", "| Скрипт | Команда |", "|---|---|"]
    for name, cmd in package_scripts():
        parts.append(f"| `{name}` | `{cmd}` |")
    parts.append("")

    return "\n".join(parts)


def main() -> None:
    md = build_md()
    if "--check" in sys.argv:
        if not OUT.exists() or OUT.read_text(encoding="utf-8") != md:
            print("IC-12: docs/INVENTORY.md устарел — запустите python3 scripts/inventory.py")
            sys.exit(1)
        print("IC-12: docs/INVENTORY.md актуален")
        return
    OUT.write_text(md, encoding="utf-8")
    n_lib = len(lib_exports())
    n_routes = len(api_routes())
    print(f"INVENTORY.md обновлён: {n_lib} экспортов lib, {n_routes} роутов, "
          f"{len(prisma_models())} моделей, {len(env_vars())} env")


if __name__ == "__main__":
    main()
