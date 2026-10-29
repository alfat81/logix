#!/usr/bin/env python3
"""Верификация релизного коммита v0.2.7 (a95e65c) на GitHub — КТ3 инструкции."""
import json
import urllib.request

URL = "https://api.github.com/repos/alfat81/logix/commits/a95e65c"
EXPECT_FILES = 28  # КТ3: «28 files changed»
MUST_HAVE = [
    "prisma/migrations/20261024170000_p1_04_money/migration.sql",
    "src/lib/money.ts",
    "docs/BRANDBOOK.md",
    "package.json",
    "prisma/schema.prisma",
    "docs/DECISIONS.md",
    "docs/RULES.md",
    "docs/ROADMAP.md",
    "CHANGELOG.md",
    "src/app/admin/orders/[id]/print/page.tsx",
]

req = urllib.request.Request(URL, headers={"Accept": "application/vnd.github+json"})
with urllib.request.urlopen(req, timeout=30) as r:
    d = json.load(r)

names = {f["filename"]: f["status"] for f in d["files"]}
stats = d["stats"]
statuses = {}
for f in d["files"]:
    statuses[f["status"]] = statuses.get(f["status"], 0) + 1

print("sha:      ", d["sha"][:7])
print("msg:      ", d["commit"]["message"].splitlines()[0])
print("date:     ", d["commit"]["committer"]["date"])
print("stats:    ", stats["files"], "files (+%d/-%d)" % (stats["additions"], stats["deletions"]))
print("statuses: ", statuses)
print("expect 28:", "OK" if stats["files"] == EXPECT_FILES else "MISMATCH")

missing = [k for k in MUST_HAVE if k not in names]
for k in MUST_HAVE:
    print("  ", "OK     " if k in names else "MISSING", k)

verdict = stats["files"] == EXPECT_FILES and not missing
print("VERDICT:  ", "PASS — состав коммита совпадает с КТ3" if verdict else "FAIL")
