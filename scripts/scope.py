#!/usr/bin/env python3
# DF-00B (G2): контроль «изменение не задевает неучтённые области».
# init:  снимок хешей файлов в .scope-baseline.json (не коммитится, в .gitignore).
# check: изменённые/новые/удалённые файлы против глобов docs/releases/SCOPE-vX.Y.Z.json.
#        Файл вне глобов — нарушение (код 1). Заявленная область без изменённых файлов —
#        предупреждение. Правка замороженного (docs/FROZEN.md) — нарушение без "unfreeze".
# Без внешних зависимостей.

import fnmatch
import hashlib
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BASELINE = ROOT / ".scope-baseline.json"
FROZEN = ROOT / "docs" / "FROZEN.md"

EXCLUDE_DIRS = {".git", "node_modules", ".next", ".staging", ".zscripts",
                "tool-results", "skills", "db", ".pg", ".turbo"}
EXCLUDE_FILES = {".scope-baseline.json", "next-env.d.ts", "tsconfig.tsbuildinfo"}
EXCLUDE_PATTERNS = ["*.zip", "*.log", "*.tsbuildinfo", "*.dump", "*.sql.gz",
                    "*.cookies", "*.cookiejar", "cookies*.txt", "cmv*", "*.cookies*"]

# Служебные/сгенерируемые пути, правки которых не требуют объявления в SCOPE
ALWAYS_ALLOWED = ["docs/INVENTORY.md"]


def excluded(p: Path) -> bool:
    parts = p.relative_to(ROOT).parts
    if any(seg in EXCLUDE_DIRS for seg in parts):
        return True
    if p.name in EXCLUDE_FILES:
        return True
    rel = p.relative_to(ROOT).as_posix()
    return any(fnmatch.fnmatch(rel, pat) for pat in EXCLUDE_PATTERNS)


def tree_hashes() -> dict[str, str]:
    out = {}
    for p in sorted(ROOT.rglob("*")):
        if p.is_file() and not excluded(p):
            rel = p.relative_to(ROOT).as_posix()
            out[rel] = hashlib.sha256(p.read_bytes()).hexdigest()
    return out


def latest_scope() -> Path | None:
    """Самый свежий SCOPE-vX.Y.Z.json по семверу."""
    def key(p: Path):
        m = re.search(r"v(\d+)\.(\d+)\.(\d+)", p.name)
        return tuple(map(int, m.groups())) if m else (0, 0, 0)
    candidates = sorted((ROOT / "docs" / "releases").glob("SCOPE-v*.json"), key=key)
    return candidates[-1] if candidates else None


def frozen_globs() -> list[str]:
    if not FROZEN.exists():
        return []
    globs = []
    for line in FROZEN.read_text(encoding="utf-8").splitlines():
        m = re.search(r"`([^`]+)`", line)
        if m and ("*" in m.group(1) or "/" in m.group(1)) and not line.strip().startswith("|--"):
            cand = m.group(1)
            if not cand.startswith(("http", "#")) and (cand.endswith("*") or cand.endswith("**") or "/**" in cand):
                globs.append(cand)
    return sorted(set(globs))


def matches(rel: str, globs: list[str]) -> bool:
    # Точное совпадение первым: глоб `src/app/api/admin/orders/[id]/...`
    # содержит литеральные скобки пути, которые fnmatch счёл бы символьным
    # классом (`[id]` = символ i или d).
    for g in globs:
        if rel == g or fnmatch.fnmatch(rel, g):
            return True
    return False


def cmd_init() -> None:
    BASELINE.write_text(json.dumps(tree_hashes(), indent=1, sort_keys=True), encoding="utf-8")
    print(f"scope init: снимок {len(tree_hashes())} файлов -> {BASELINE.name}")


def cmd_check(argv: list[str]) -> int:
    if not BASELINE.exists():
        print("scope check: .scope-baseline.json не найден — сначала python3 scripts/scope.py init")
        return 2
    scope_file = None
    for a in argv:
        if a.startswith("--scope="):
            scope_file = ROOT / a.split("=", 1)[1]
    scope_file = scope_file or latest_scope()
    if scope_file is None or not scope_file.exists():
        print("scope check: docs/releases/SCOPE-v*.json не найден — создайте область задачи")
        return 2
    scope = json.loads(scope_file.read_text(encoding="utf-8"))
    globs: list[str] = scope.get("globs", [])
    unfreeze = bool(scope.get("unfreeze", False))
    frozen = frozen_globs()

    before = json.loads(BASELINE.read_text(encoding="utf-8"))
    after = tree_hashes()
    changed = sorted(k for k in after if k in before and before[k] != after[k])
    added = sorted(k for k in after if k not in before)
    deleted = sorted(k for k in before if k not in after)
    touched = changed + added + deleted

    violations, warnings = [], []
    for rel in touched:
        if rel in ALWAYS_ALLOWED or matches(rel, globs):
            if matches(rel, frozen) and not unfreeze:
                violations.append(f"FROZEN (заморожено, D31; нужен unfreeze): {rel}")
            continue
        violations.append(f"ВНЕ ОБЛАСТИ (не входит в {scope_file.name}): {rel}")
    for g in globs:
        if not any(fnmatch.fnmatch(rel, g) for rel in after):
            continue  # глоб не задел ни один существующий файл — возможно, добавил новые
        if not any(fnmatch.fnmatch(rel, g) for rel in touched):
            warnings.append(f"заявлена область без изменений: {g}")
    for rel in touched:
        print(f"  изменён: {rel}")
    for w in warnings:
        print(f"  WARN: {w}")
    for v in violations:
        print(f"  FAIL: {v}")
    if violations:
        print(f"scope check: {len(violations)} нарушений, {len(warnings)} предупреждений "
              f"(scope: {scope.get('task', '?')})")
        return 1
    print(f"scope check: OK — {len(touched)} файлов в области «{scope.get('task', '?')}'', "
          f"{len(warnings)} предупреждений")
    return 0


def main() -> None:
    if len(sys.argv) < 2 or sys.argv[1] not in ("init", "check"):
        print(__doc__)
        sys.exit(2)
    if sys.argv[1] == "init":
        cmd_init()
        sys.exit(0)
    sys.exit(cmd_check(sys.argv[2:]))


if __name__ == "__main__":
    main()
