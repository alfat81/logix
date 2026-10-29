#!/usr/bin/env python3
# DF-02A: восстановление .scope-baseline.json после сброса окружения.
# Прецедент Блока 1: baseline = чистое дерево v0.6.1. В песочнице git-
# истории logix нет, поэтому собираем из двух источников:
#   1) zip v0.6.1 (392 файла — контент релиза);
#   2) файлы на диске, ОТСУТСТВУЮЩИЕ в zip, но существовавшие в v0.6.1:
#      старые релиз-доки (build-release кладёт в архив только с v0.5.0)
#      и src/lib/mock-db.ts (тест-хелпер, из архива исключён).
# Критерий «существовал в v0.6.1»: mtime раньше сборки архива
# (27.10.2026 12:06) — файлы задачи DF-02A созданы позже и не попадут.
import hashlib
import importlib.util
import json
import sys
import zipfile
from datetime import datetime
from pathlib import Path

ROOT = Path('/home/z/my-project/logix')
ZIP = Path('/home/z/my-project/download/logix-v0.6.1.zip')
BASELINE = ROOT / '.scope-baseline.json'
RELEASE_BUILD = datetime(2026, 10, 27, 12, 6).timestamp()

spec = importlib.util.spec_from_file_location('scope', ROOT / 'scripts' / 'scope.py')
scope = importlib.util.module_from_spec(spec)
spec.loader.exec_module(scope)

sha = lambda b: hashlib.sha256(b).hexdigest()

out: dict[str, str] = {}
with zipfile.ZipFile(ZIP) as z:
    for name in z.namelist():
        if name.endswith('/'):
            continue
        out[name] = sha(z.read(name))

added, skipped = [], []
for p in sorted(ROOT.rglob('*')):
    if not p.is_file() or scope.excluded(p):
        continue
    rel = str(p.relative_to(ROOT))
    if rel in out:
        continue
    if p.stat().st_mtime >= RELEASE_BUILD:
        skipped.append(rel)
        continue
    out[rel] = sha(p.read_bytes())
    added.append(rel)

json.dump(out, open(BASELINE, 'w'), indent=0)
print(f'baseline: {len(out)} файлов (zip + {len(added)} дисковых до v0.6.1)')
print('добавлены:', *added, sep='\n  ')
print('пропущены (mtime позже сборки v0.6.1 — файлы задачи):', *skipped, sep='\n  ')
