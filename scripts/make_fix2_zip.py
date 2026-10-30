# Сборка logix-v0.7.0-fix2.zip — только изменённые файлы (RULES 2.16, KT1).
import zipfile, hashlib, os, shutil

ROOT = '/home/z/my-project'
OUT = f'{ROOT}/download/logix-v0.7.0-fix2.zip'
NAMES = [
    'CHANGELOG.md',
    'docs/INVENTORY.md',
    'src/components/admin/customs/CustomsCalcForm.tsx',
    'src/components/admin/customs/CustomsAllocationSelects.tsx',
    'docs/releases/RELEASE-NOTES-v0.7.0-fix1.md',
    'docs/releases/RELEASE-NOTES-v0.7.0-fix2.md',
    'docs/releases/RELEASE-INSTRUCTIONS-v0.7.0-fix2.md',
]

with zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED) as o:
    for n in NAMES:
        o.write(f'{ROOT}/{n}', n)

# Фоллбек *.zip_ (маска .gitignore:13 *.zip) + копия в releases/
for dst in [f'{ROOT}/download/logix-v0.7.0-fix2.zip_',
            f'{ROOT}/upload/logix-v0.7.0-fix2.zip_',
            f'{ROOT}/releases/logix-v0.7.0-fix2.zip']:
    shutil.copyfile(OUT, dst)

h = hashlib.sha256(open(OUT, 'rb').read()).hexdigest()
print('OK', OUT, os.path.getsize(OUT), 'bytes')
print('SHA-256', h)
with zipfile.ZipFile(OUT) as z:
    for i in z.infolist():
        print(' -', i.filename, i.file_size)
