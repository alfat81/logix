#!/usr/bin/env python3
# DF-00D Блок 5: чистка устаревших записей baseline IC-03 :write.
# Эвристика маркера выровнена с буквой правила (write: true в объекте опций),
# шесть записей для master-only роутов стали STALE — храповик уменьшается.

import json
from pathlib import Path

ROOT = Path("/home/z/my-project/logix")
BASELINE = ROOT / "scripts" / "integrity-baseline.json"

STALE = {
    "src/app/api/admin/employees/[id]/route.ts:write",
    "src/app/api/admin/employees/route.ts:write",
    "src/app/api/admin/legal-entities/[id]/route.ts:write",
    "src/app/api/admin/legal-entities/route.ts:write",
    "src/app/api/admin/stage-catalog/[id]/route.ts:write",
    "src/app/api/admin/stage-catalog/route.ts:write",
}

b = json.loads(BASELINE.read_text(encoding="utf-8"))
before = sum(len(v) for v in b.values())
if "IC-03" in b:
    b["IC-03"] = [e for e in b["IC-03"] if e["key"] not in STALE]
    if not b["IC-03"]:
        del b["IC-03"]
after = sum(len(v) for v in b.values())
BASELINE.write_text(json.dumps(b, indent=1, ensure_ascii=False), encoding="utf-8")
print(f"baseline: {before} -> {after} записей (убрано {before - after})")
