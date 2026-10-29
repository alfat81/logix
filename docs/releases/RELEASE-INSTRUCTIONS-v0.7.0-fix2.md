# RELEASE-INSTRUCTIONS v0.7.0-fix2

Патч к v0.7.0 — чинит красный CI после fix1 (integrity: IC-08 + IC-09). Без миграций, без сида, версия пакета не меняется (0.7.0). БД не затронута.

## 1. Синхронизация и распаковка

Архив `logix-v0.7.0-fix2.zip` содержит ТОЛЬКО изменённые файлы (пути сохранены; 2 файла кода + 5 документов). Распаковать в `C:\PROJECTS\logix` поверх:

```powershell
git fetch origin
git status
# если behind origin/main и локальных коммитов нет:
git reset --hard origin/main
Expand-Archive -Path .\logix-v0.7.0-fix2.zip -DestinationPath C:\PROJECTS\logix -Force
```

Состав архива (ожидается в `git status --short`):

- `CHANGELOG.md` (изменён)
- `docs/INVENTORY.md` (изменён — добавлен новый компонент)
- `src/components/admin/customs/CustomsCalcForm.tsx` (изменён)
- `src/components/admin/customs/CustomsAllocationSelects.tsx` (новый)
- `docs/releases/RELEASE-NOTES-v0.7.0-fix1.md` (изменён — формулировка без пути)
- `docs/releases/RELEASE-NOTES-v0.7.0-fix2.md` (новый)
- `docs/releases/RELEASE-INSTRUCTIONS-v0.7.0-fix2.md` (новый)

## 2. Контрольные точки

1. `git status --short` — состав обязан совпасть со списком выше (7 строк, включая новые `src/components/admin/customs/…`); расхождение — стоп и чат агенту.
2. Версия не менялась: `Select-String -Path .\package.json -Pattern '"version"'` — ожидание 0.7.0.

## 3. Публикация

```powershell
git add -A
git commit -m "release v0.7.0-fix2: CI после fix1 — IC-08 снята (в prose NOTES-fix1 путь на скрипт конвейера заменён формулировкой без пути) и IC-09 снята (CustomsCalcForm 308->289, селекты распределения вынесены в CustomsAllocationSelects); UI-поведение не менялось (vitest 264, e2e 343)"
git push origin main
```

## 4. CI и Vercel

- CI — зелёный ожидание (прогон песочницы: integrity PASS новых 0, vitest 264/264, tsc 0, eslint 0, build OK, e2e 343/343). Красный — прислать лог, откат `git revert HEAD --no-edit && git push origin main`.
- Vercel → Deployments → Ready. Env не менялся, миграций нет — кроме пуша ничего не требуется.

## 5. Смоук (прод — необязателен, UI-поведение не менялось)

1. Карточка сделки → «Расчёт таможенных платежей» → расчёт с несколькими строками кода: блок «Распределение перевозки / Распределение прочих расходов» на месте (теперь это отдельный компонент).
2. Сохранение расчёта — работает (API не менялось).

## Откат

`git revert HEAD --no-edit && git push origin main`. БД не затронута — патч только структура кода и документы.
