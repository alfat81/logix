# RELEASE-INSTRUCTIONS v0.7.9 — Роадмап: DF-22 в очереди (docs-only)

Владелец выполняет в PowerShell из клона `C:\PROJECTS\logix`. База — v0.7.8. **Релиз без изменений кода**: распаковка, контрольные точки, коммит, пуш, зелёный CI. Смоук и деплой-проверки не требуются (Vercel пересоберёт сам, поведение приложения не менялось).

## Шаг 0. Синхронизация клона (до распаковки!)

```powershell
git fetch origin
git status
```

Если ветка behind `origin/main` и локальных коммитов нет:

```powershell
git reset --hard origin/main
```

Если есть локальные коммиты или незавершённый rebase/merge — чат агенту, самому не мержить.

## Шаг 1. Распаковка архива

```powershell
Expand-Archive -Path .\logix-v0.7.9.zip -DestinationPath . -Force
```

**КТ1 — версия:**

```powershell
Select-String -Path .\package.json -Pattern '"version"'
```

Ожидается `"version": "0.7.9"`. Не совпало — стоп, чат агенту.

**КТ2 — состав (перед коммитом):**

```powershell
git status --short
```

Ожидается **8 файлов**: 5 изменённых (`M`) + 3 новых (`??`). Изменённые (`M`, 5):

```
CHANGELOG.md
docs/ROADMAP.md
docs/ROADMAP-DEALFLOW.md
package.json
scripts/scope.py
```

Новые (`??`, 3):

```
docs/releases/RELEASE-INSTRUCTIONS-v0.7.9.md
docs/releases/RELEASE-NOTES-v0.7.9.md
docs/releases/SCOPE-v0.7.9.json
```

Примечания к составу:
- `src/**`, `prisma/` в списке отсутствуют — это docs-only релиз (единственная кодовая правка — служебный гейт `scripts/scope.py`: каталоги `download/`/`upload/` исключены из проверки области, выровнено с build-release.py; в CI скоуп-гейт не выполняется, на прод не влияет);
- появление строк `src/` или `prisma/` — стоп, чат агенту;
- сам архив `logix-v0.7.9.zip` в `git status` не считается (он не распаковывается в репо, а лежит рядом).

Расхождение по числу/составу — стоп, чат агенту.

**КТ2б — признак docs-only:**

```powershell
git status --short | Select-String 'src/'
```

Ожидается пустой вывод.

## Шаг 2. Коммит и пуш

```powershell
# Одинарные кавычки PowerShell: внутри НЕ должно быть двойных и
# типографских (кавычки-ёлочки и пр.) — урок v0.7.4.
git add -A
git commit -m 'release v0.7.9: docs-only — аудит вкладок после DF-21 и карточка DF-22 в очереди роадмапа (общий вид секций: Этапы, Варианты расчёта, Квалификация/Пул); код не менялся'
git log --oneline -2
git push origin main
```

`git log --oneline -2` обязан показать верхним `release v0.7.9: …` — коммит создался. Не показал — стоп, чат агенту.

## Шаг 3. CI

Дождаться зелёного GitHub Actions (checks + integrity + e2e + заморозка + gitleaks). Красный — прислать лог агенту; откат `git revert HEAD --no-edit && git push`.

## Шаг 4. Vercel

Deployments → Ready. Поведение приложения не менялось — смоук не требуется.
