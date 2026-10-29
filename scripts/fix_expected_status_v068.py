#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Rebuild expected-git-status block in RELEASE-INSTRUCTIONS-v0.6.8.md
without mode-only noise (0/0 numstat rows), then it can be re-committed."""
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BASE = "cddc368"
F = ROOT / "docs" / "releases" / "RELEASE-INSTRUCTIONS-v0.6.8.md"


def sh(cmd):
    return subprocess.run(cmd, cwd=str(ROOT), text=True, capture_output=True).stdout or ""


# name-status rows for all deltas
ns = {}
for line in sh(["git", "diff", "--name-status", BASE]).splitlines():
    parts = line.split("\t")
    if len(parts) >= 2:
        status = parts[0]
        path = parts[-1]
        ns[path] = status

# paths with real content change (numstat not 0/0)
content = set()
for line in sh(["git", "diff", "--numstat", BASE]).splitlines():
    parts = line.split("\t")
    if len(parts) == 3:
        add, dele, path = parts[0], parts[1], parts[2]
        if not (add == "0" and dele == "0"):
            content.add(path)

rows = [f"{ns[p]}\t{p}" for p in sorted(ns) if p in content]
others = [u for u in sh(["git", "ls-files", "--others", "--exclude-standard"]).splitlines() if u.strip()]
for u in others:
    rows.append("?\t" + u)
if "docs/releases/RELEASE-INSTRUCTIONS-v0.6.8.md" not in others and \
   "docs/releases/RELEASE-INSTRUCTIONS-v0.6.8.md" not in ns:
    rows.append("?\tdocs/releases/RELEASE-INSTRUCTIONS-v0.6.8.md")

block = "```\n" + "\n".join(rows) + "\n```"
text = F.read_text(encoding="utf-8")
new_text, n = re.subn(r"```\n.*?\n```", block, text, count=1, flags=re.S)
if n != 1:
    raise SystemExit("block not found")
F.write_text(new_text, encoding="utf-8")
print("rows:", len(rows))
print(new_text[new_text.index("```\nM") if "```\nM" in new_text else 0:][:400])
