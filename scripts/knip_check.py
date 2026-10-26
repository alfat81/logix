#!/usr/bin/env python3
# DF-00B (G4 п. 3): knip в режиме храповика.
# python3 scripts/knip_check.py                 — прогон против scripts/knip-baseline.json
# python3 scripts/knip_check.py --write-baseline — зафиксировать текущие находки как baseline
# knip запускается строго под bun (`bunx --bun knip`): под node oxc-parser включает
# raw-transfer с буфером 1 GiB и падает в ограниченных окружениях; под bun сам
# выбирает безопасный режим. Без внешних зависимостей.

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BASELINE_FILE = ROOT / "scripts" / "knip-baseline.json"

CATEGORIES = ("files", "dependencies", "devDependencies", "unlisted", "binaries",
              "exports", "types", "duplicates", "enumMembers", "namespaces")


def findings() -> list[tuple[str, str]]:
    r = subprocess.run(["bunx", "--bun", "knip", "--reporter", "json"], cwd=ROOT,
                       capture_output=True, text=True, timeout=300)
    if r.returncode not in (0, 1) or not r.stdout.strip():
        # knip: 0 — чисто, 1 — есть находки; остальное — ошибка запуска
        print(f"knip запуск не удался (rc={r.returncode}): {r.stderr.strip()[:300]}")
        sys.exit(2)
    data = json.loads(r.stdout)
    out: list[tuple[str, str]] = []
    for f in data.get("issues", []):
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
    base = {e["key"] for e in baseline}
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
