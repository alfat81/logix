#!/usr/bin/env python3
# DF-00B (G4 п. 3): knip в режиме храповика.
# python3 scripts/knip_check.py                 — прогон против scripts/knip-baseline.json
# python3 scripts/knip_check.py --write-baseline — зафиксировать текущие находки как baseline
# knip запускается строго под bun (`bunx --bun knip`): под node oxc-parser включает
# raw-transfer с буфером 1 GiB и падает в ограниченных окружениях; под bun сам
# выбирает безопасный режим. Без внешних зависимостей.

import fnmatch
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BASELINE_FILE = ROOT / "scripts" / "knip-baseline.json"
FROZEN = ROOT / "docs" / "FROZEN.md"

CATEGORIES = ("files", "dependencies", "devDependencies", "unlisted", "binaries",
              "exports", "types", "duplicates", "enumMembers", "namespaces")


def frozen_globs() -> list[str]:
    """Глобы из секции «Замороженные глобы» docs/FROZEN.md (D31, G4 п. 8):
    замороженные области — не рудименты и из находок knip исключаются.
    Секция — от заголовка «## Замороженные глобы» до следующего «## »;
    в остальных разделах FROZEN.md упоминаются живые пути."""
    if not FROZEN.exists():
        return []
    out, inside = [], False
    for ln in FROZEN.read_text(encoding="utf-8").splitlines():
        if ln.startswith("## "):
            inside = ln.strip() == "## Замороженные глобы"
        elif inside and (m := re.search(r"`([^`]+)`", ln)):
            c = m.group(1)
            if not c.startswith(("http", "#")) and (
                c.endswith("*") or "/**" in c
                or (c.startswith(("src/", "scripts/", "prisma/")) and c.count("/") >= 2)
            ):
                out.append(c)
    return sorted(set(out))


def is_frozen(path: str, globs: list[str]) -> bool:
    return any(path == g or fnmatch.fnmatch(path, g) for g in globs)


def findings() -> list[tuple[str, str]]:
    r = subprocess.run(["bunx", "--bun", "knip", "--reporter", "json"], cwd=ROOT,
                       capture_output=True, text=True, timeout=300)
    if r.returncode not in (0, 1) or not r.stdout.strip():
        # knip: 0 — чисто, 1 — есть находки; остальное — ошибка запуска
        print(f"knip запуск не удался (rc={r.returncode}): {r.stderr.strip()[:300]}")
        sys.exit(2)
    data = json.loads(r.stdout)
    frz = frozen_globs()
    out: list[tuple[str, str]] = []
    for f in data.get("issues", []):
        if frz and is_frozen(f["file"], frz):
            continue  # D31: замороженное не рудимент — находки не собираем
        for cat in CATEGORIES:
            for item in f.get(cat) or []:
                name = item["name"] if isinstance(item, dict) else item
                extra = f":{item.get('exported', '')}" if isinstance(item, dict) and item.get("exported") else ""
                out.append((f"{cat}:{f['file']}", f"{name}{extra}"))
    return sorted(out)


def main() -> None:
    write = "--write-baseline" in sys.argv[1:]
    cur = findings()
    if write:
        BASELINE_FILE.write_text(json.dumps(
            [{"key": f"{k}|{v}"} for k, v in cur], indent=1, ensure_ascii=False),
            encoding="utf-8")
        print(f"knip baseline записан: {len(cur)} записей")
        sys.exit(0)
    baseline: list[dict] = []
    if BASELINE_FILE.exists():
        baseline = json.loads(BASELINE_FILE.read_text(encoding="utf-8"))
    frz = frozen_globs()
    base = {e["key"] for e in baseline}
    if frz:
        # D31: записи baseline по замороженным файлам выпадают из сверки
        # (файл может заржаветь молча). Файл baseline чистится --write-baseline.
        frozen_base = {k for k in base if is_frozen(k.split("|", 1)[0].split(":", 1)[1], frz)}
        base -= frozen_base
        if frozen_base:
            print(f"knip: исключено из baseline (заморожено, D31): {len(frozen_base)} записей")
    cur_keys = {f"{k}|{v}" for k, v in cur}
    new = sorted(cur_keys - base)
    stale = sorted(base - cur_keys)
    print(f"knip: находок {len(cur)} (baseline {len(base)})")
    for k in new:
        print(f"  NEW  {k}")
    for k in stale:
        print(f"  STALE {k} (находка устранена — уберите из baseline)")
    sys.exit(1 if (new or stale) else 0)


if __name__ == "__main__":
    main()
