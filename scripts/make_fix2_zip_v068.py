"""Сборка патч-архива logix-v0.6.8-fix2.zip (прецедент fix1/fix2/fix3 v0.6.7).

Основание: обращение владельца 29.10.2026 — Шаг 9 деплоя v0.6.8 упал по P2028
(дефолтные 5 с интерактивной транзакции < вставка 13 294 строк до Neon по WAN).
Состав: исправленный scripts/import-hs.ts (timeout 60s), инструкции, notes.
Читает ФАЙЛЫ РЕПОЗИТОРИЯ (не старые zip) — источник истины один.
Результат: download/RELEASE-v0.6.8-fix2/logix-v0.6.8-fix2.zip (+ .zip_, SHA256SUMS.txt)
"""
import hashlib
import os
import shutil
import zipfile

ROOT = '/home/z/my-project'
OUT_DIR = os.path.join(ROOT, 'download', 'RELEASE-v0.6.8-fix2')
OUT = os.path.join(OUT_DIR, 'logix-v0.6.8-fix2.zip')

NAMES = [
    'scripts/import-hs.ts',
    'docs/releases/RELEASE-INSTRUCTIONS-v0.6.8.md',
    'docs/releases/RELEASE-NOTES-v0.6.8-fix2.md',
]

os.makedirs(OUT_DIR, exist_ok=True)
with zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED) as o:
    for n in NAMES:
        with open(os.path.join(ROOT, n), 'rb') as f:
            o.writestr(n, f.read())
shutil.copyfile(OUT, OUT + '_')
data = open(OUT, 'rb').read()
h = hashlib.sha256(data).hexdigest()
with open(os.path.join(OUT_DIR, 'SHA256SUMS.txt'), 'w', encoding='utf-8') as s:
    s.write(f'{h}  logix-v0.6.8-fix2.zip\n')
    s.write(f'{h}  logix-v0.6.8-fix2.zip_\n')
print('OK', OUT, os.path.getsize(OUT), 'bytes')
print('SHA-256', h)
