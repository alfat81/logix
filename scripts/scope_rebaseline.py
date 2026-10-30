#!/usr/bin/env python3
"""Восстановление .scope-baseline.json из git HEAD (дерево последнего релиза).

Ситуация: scope init выполнен ПОСЛЕ начала правок релиза — снимок запомнил
уже изменённое дерево, и check теряет diff. Baseline = содержимое HEAD
(рабочее дерево было чистым на старте задачи). Хеши и исключения — те же,
что в scripts/scope.py (переиспользуются импортом), содержимое — blob'ы HEAD.

Запуск: python3 scripts/scope_rebaseline.py   # только для песочницы агента
"""
import hashlib
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
import scope  # noqa: E402  (переиспользуем excluded() и константы 1-в-1)

files = subprocess.run(
    ["git", "ls-tree", "-r", "HEAD", "--name-only"],
    capture_output=True, text=True, check=True,
).stdout.split("\n")

out = {}
for rel in files:
    if not rel:
        continue
    if scope.excluded(ROOT / rel):
        continue
    blob = subprocess.run(
        ["git", "show", f"HEAD:{rel}"], capture_output=True, check=True
    ).stdout
    out[rel] = hashlib.sha256(blob).hexdigest()

scope.BASELINE.write_text(
    json.dumps(out, indent=1, sort_keys=True), encoding="utf-8"
)
print(f"scope rebaseline: {len(out)} файлов из HEAD -> {scope.BASELINE.name}")
