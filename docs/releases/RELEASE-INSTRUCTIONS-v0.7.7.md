# RELEASE-INSTRUCTIONS v0.7.7 — Фикс «красного» CI: хрупкий тест сводки владельца

Владелец выполняет в PowerShell из клона `C:\PROJECTS\logix`. База — v0.7.6. **Миграций нет, новых env нет, новых зависимостей нет, прод не задет** (правка одного тест-файла) — распаковка, контрольные точки, коммит, пуш, зелёный CI.

## Шаг 0. Синхронизация клона (до распаковки!)

```powershell
git fetch origin
git status
```

Если ветка behind `origin/main` и локальных коммитов нет:

```powershell
git reset --hard origin/main
```

Если есть локальные коммиты или незавершённый rebase/merge — чат агенту, самому не мержить. Текущий `origin/main` красный в CI (гонка в тесте сводки) — это ожидаемо, именно его чинит v0.7.7.

## Шаг 1. Распаковка архива

```powershell
Expand-Archive -Path .\logix-v0.7.7.zip -DestinationPath . -Force
```

**КТ1 — версия:**

```powershell
Select-String -Path .\package.json -Pattern '"version"'
```

Ожидается `"version": "0.7.7"`. Не совпало — стоп, чат агенту.

**КТ2 — состав (перед коммитом):**

```powershell
git status --short
```

Ожидается 7 файлов. Изменённые (`M`, 4):

```
CHANGELOG.md
docs/ROADMAP.md
package.json
src/lib/notifications/owner-digest.test.ts
```

Новые (`??`/`A`, 3):

```
docs/releases/RELEASE-INSTRUCTIONS-v0.7.7.md
docs/releases/RELEASE-NOTES-v0.7.7.md
docs/releases/SCOPE-v0.7.7.json
```

Примечание: правка `owner-digest.test.ts` — только тест (утверждения скоуплены своим ключом дедупа, урок — в комментарии теста и RELEASE-NOTES); `docs/ROADMAP.md` — статус-блок (гейт IC-07). Прод-файлы (`owner-digest.ts`, dispatch, схема, UI) НЕ в списке — их изменения быть не должно. Расхождение по числу/составу — стоп, чат агенту.

## Шаг 2. Коммит и пуш

```powershell
# Одинарные кавычки PowerShell: внутри НЕ должно быть двойных и
# типографских (кавычки-ёлочки и пр.) — урок v0.7.4.
git add -A
git commit -m 'release v0.7.7: фикс красного CI — хрупкий интеграционный тест сводки владельца (глобальный счётчик sent заменён скоупом по своему ключу дедупа, дедуп доказывается тем же id письма); прод не задет'
git log --oneline -2
git push origin main
```

`git log --oneline -2` обязан показать верхним `release v0.7.7: …` — коммит создался. Не показал — стоп, чат агенту.

## Шаг 3. CI

Дождаться зелёного GitHub Actions (checks + integrity + e2e + заморозка + gitleaks). Красный — прислать лог агенту; откат `git revert HEAD --no-edit && git push`.

## Шаг 4. Vercel

Deployments → Ready (env не менялись; прод-код не менялся — redeploy не требуется).

## Шаг 5. Smoke (прод)

Не требуется: поведение приложения не менялось. Достаточно зелёного CI (шаг 3).
