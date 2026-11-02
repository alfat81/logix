# RELEASE-INSTRUCTIONS v0.8.2 — docs-only: DEPLOY.md приведён к факту DF-11/0.8.1 (03.11.2026)

Патч поверх v0.8.1: только документация и версия. Миграций нет, env-переменных нет, зависимостей нет — `npm install` не требуется, Redeploy вручную не требуется. Все команды — готовые блоки для PowerShell (D20): копируйте и выполняйте как есть.

## Состав

| Файл | Изменение |
| --- | --- |
| `DEPLOY.md` | §3 починен (env-таблица вынесена из код-блока; хранение файлов — по факту DF-11); DF-11-раздел: правило «S3_* изменены → Redeploy» + смоук-признаки; §4.3: фиксация отсутствия Vercel Cron |
| `CHANGELOG.md` | запись [0.8.2] |
| `package.json` | версия 0.8.2 |
| `docs/ROADMAP.md` | статус-блок v0.8.2 |
| `docs/ROADMAP-DEALFLOW.md` | очередь сдвинута: DF-12 → 0.8.3, DF-13 → 0.8.4, DF-14 → 0.8.5, DF-15 → 0.8.6 |
| `docs/releases/RELEASE-NOTES-v0.8.2.md` | этот релиз |
| `docs/releases/RELEASE-INSTRUCTIONS-v0.8.2.md` | эта инструкция |

## Шаги владельца

1. **Синхронизировать клон** (перед распаковкой — урок 24.10: не пушить из отставшего клона):

```powershell
git fetch origin
git status
```

Если статус «behind origin/main» и локальных коммитов нет:

```powershell
git reset --hard origin/main
```

Если есть локальные коммиты или незавершённый rebase/merge — **стоп**, напишите в чат агенту, сами не мержите.

2. **Распаковать архив** `logix-v0.8.2.zip` в клон `C:\PROJECTS\logix` с заменой:

```powershell
Expand-Archive -Path .\logix-v0.8.2.zip -DestinationPath . -Force
```

3. **КТ1 — версия после распаковки:**

```powershell
Select-String -Path .\package.json -Pattern '"version"'
```

Ожидание ровно одно: `"version": "0.8.2"`. Не совпало — **стоп** и чат агенту (инцидент v0.2.6 24.10.2026: распаковка пропущена — дальше по цепочке едет не то состояние).

4. **КТ2 — состав перед коммитом:**

```powershell
git status --short
```

Ожидание: **ровно 7 строк** — пять изменённых (`DEPLOY.md`, `CHANGELOG.md`, `package.json`, `docs/ROADMAP.md`, `docs/ROADMAP-DEALFLOW.md`) и два новых (`docs/releases/RELEASE-NOTES-v0.8.2.md`, `docs/releases/RELEASE-INSTRUCTIONS-v0.8.2.md`). Обязательно наличие строк `package.json` и `DEPLOY.md`. Посторонние файлы или другое число строк — **стоп** и чат агенту (служебные файлы конвейера в архив не входят — урок v0.6.8).

5. **Коммит и пуш** (пуш на GitHub — владелец, RULES 2.11):

```powershell
git add -A
git commit -m "release v0.8.2: docs-only — DEPLOY.md приведён к факту DF-11/0.8.1 (раздел 3 починен, правило S3_* -> Redeploy, фиксация отсутствия Vercel Cron); код не менялся"
git push origin main
```

6. **CI и деплой.** Дождаться зелёного в GitHub Actions (вкладка Actions) и Ready в Vercel (Deployments). Миграций нет — миграционный шаг пропускается. Env-переменных в этом релизе нет — Redeploy вручную не нужен: Vercel пересоберёт стандартно по push.

7. **Контроль результата** (smoke не применимо — код не менялся; проверка документационная):

```powershell
Select-String -Path .\DEPLOY.md -Pattern 'Переменные DF-11'
Select-String -Path .\DEPLOY.md -Pattern 'После добавления или изменения любых'
```

Обе команды должны найти совпадение; в разделе 3 `DEPLOY.md` таблица переменных идёт после закрытого код-блока `bun install` / `cp .env.example .env`, а не внутри него. На проде ничего проверять не нужно: рантайм не изменился.

## Если что-то не так

- **КТ1/КТ2 не сошлись** — чат агенту, дальше не идти.
- **CI красный** — прислать агенту лог упавшего шага; откат:

```powershell
git revert HEAD --no-edit
git push origin main
```

- **Версия в Vercel не обновилась** — обычное поведение для docs-релиза без изменений кода не является ошибкой; сверка деплоя — по SHA коммита в Deployments.

## Отчёт

После зелёного CI и Ready — короткое подтверждение в чат: версия КТ1, число строк КТ2, ссылка на коммит. DF-12 (v0.8.3) стартует следующей карточкой.
