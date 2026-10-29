"""Сборка патч-архива logix-v0.6.8-fix3.zip (прецедент fix1/fix2/fix3 v0.6.7).

Основание: красный CI integrity на релизном коммите v0.6.8 — IC-08, две
висячие ссылки: примечание к КТ2 в инструкции ссылалось бэктик-путями на
служебные скрипты конвейера, которые сознательно не входят в архивы (на
origin их нет). Фикс docs-only: формулировка без путей + notes fix3.
Читает ФАЙЛЫ РЕПОЗИТОРИЯ (не старые zip) — источник истины один.
Результат: download/RELEASE-v0.6.8-fix3/logix-v0.6.8-fix3.zip (+ .zip_, SHA256SUMS.txt)
"""
import hashlib
import os
import shutil
import zipfile

ROOT = '/home/z/my-project'
OUT_DIR = os.path.join(ROOT, 'download', 'RELEASE-v0.6.8-fix3')
OUT = os.path.join(OUT_DIR, 'logix-v0.6.8-fix3.zip')

NAMES = [
    'docs/releases/RELEASE-INSTRUCTIONS-v0.6.8.md',
    'docs/releases/RELEASE-NOTES-v0.6.8-fix3.md',
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
    s.write(f'{h}  logix-v0.6.8-fix3.zip\n')
    s.write(f'{h}  logix-v0.6.8-fix3.zip_\n')
print('OK', OUT, os.path.getsize(OUT), 'bytes')
print('SHA-256', h)
