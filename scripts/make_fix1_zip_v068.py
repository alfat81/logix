"""Сборка патч-архива logix-v0.6.8-fix1.zip (прецедент fix1/fix2/fix3 v0.6.7).

Основание: красный CI gitleaks на снапшот-пуше 151978e — false positive на
scripts/hs-source/ett-page.html:49 (публичный конфиг страницы tws.by).
Состав: изменённые файлы репо (.gitleaks.toml, redacted ett-page.html,
инструкции rev. B) + notes. Читает ФАЙЛЫ РЕПОЗИТОРИЯ (не старые zip) —
источник истины один.
Результат: download/RELEASE-v0.6.8-fix1/logix-v0.6.8-fix1.zip (+ .zip_, SHA256SUMS.txt)
"""
import hashlib
import os
import shutil
import zipfile

ROOT = '/home/z/my-project'
OUT_DIR = os.path.join(ROOT, 'download', 'RELEASE-v0.6.8-fix1')
OUT = os.path.join(OUT_DIR, 'logix-v0.6.8-fix1.zip')

NAMES = [
    '.gitleaks.toml',
    'scripts/hs-source/ett-page.html',
    'docs/releases/RELEASE-INSTRUCTIONS-v0.6.8.md',
    'docs/releases/RELEASE-NOTES-v0.6.8-fix1.md',
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
    s.write(f'{h}  logix-v0.6.8-fix1.zip\n')
    s.write(f'{h}  logix-v0.6.8-fix1.zip_\n')
print('OK', OUT, os.path.getsize(OUT), 'bytes')
print('SHA-256', h)
