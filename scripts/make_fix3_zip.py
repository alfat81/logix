"""Сборка патч-архива logix-v0.6.7-fix3.zip (прецедент fix1/fix2).

Состав: изменённые файлы репо (scheduler.yml, инструкции v0.6.7) + notes.
Читает ФАЙЛЫ РЕПОЗИТОРИЯ (не старые zip) — источник истины один.
Результат: download/RELEASE-v0.6.7-fix3/logix-v0.6.7-fix3.zip + SHA256SUMS.txt
"""
import hashlib
import os
import zipfile

ROOT = '/home/z/my-project'
OUT_DIR = os.path.join(ROOT, 'download', 'RELEASE-v0.6.7-fix3')
OUT = os.path.join(OUT_DIR, 'logix-v0.6.7-fix3.zip')

NAMES = [
    '.github/workflows/scheduler.yml',
    'docs/releases/RELEASE-INSTRUCTIONS-v0.6.7.md',
    'docs/releases/RELEASE-NOTES-v0.6.7-fix3.md',
]

os.makedirs(OUT_DIR, exist_ok=True)
with zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED) as o:
    for n in NAMES:
        with open(os.path.join(ROOT, n), 'rb') as f:
            o.writestr(n, f.read())

data = open(OUT, 'rb').read()
h = hashlib.sha256(data).hexdigest()
print('OK', OUT, os.path.getsize(OUT), 'bytes')
print('SHA-256', h)
with zipfile.ZipFile(OUT) as z:
    for i in z.infolist():
        print(' -', i.filename, i.file_size)

sums = os.path.join(OUT_DIR, 'SHA256SUMS.txt')
with open(sums, 'w') as f:
    f.write(f'{h}  logix-v0.6.7-fix3.zip\n')
print('SUMS', sums)
