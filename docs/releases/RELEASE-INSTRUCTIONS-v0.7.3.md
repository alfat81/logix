# RELEASE-INSTRUCTIONS v0.7.3 — D45: невыбранный расчёт, плашка через 2 рабочих дня

Владелец выполняет в PowerShell из клона `C:\PROJECTS\logix`. База — v0.7.2. **Миграций нет, новых env нет, новых зависимостей нет.**

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
Expand-Archive -Path .\logix-v0.7.3.zip -DestinationPath . -Force
```

**КТ1 — версия:**

```powershell
Select-String -Path .\package.json -Pattern '"version"'
```

Ожидается `"version": "0.7.3"`. Не совпало — стоп, чат агенту.

**КТ2 — состав (перед коммитом):**

```powershell
git status --short
```

Ожидается 22 файла. Изменённые (`M`, 15):

```
CHANGELOG.md
docs/DECISIONS.md
docs/INVENTORY.md
docs/ROADMAP-DEALFLOW.md
docs/ROADMAP.md
knip.json
package.json
scripts/e2e_api_test.py
src/app/api/admin/attention/route.ts
src/components/admin/WaitingBadge.tsx
src/components/admin/attention/AttentionSections.tsx
src/components/admin/attention/types.ts
src/lib/waiting-db.ts
src/lib/waiting.test.ts
src/lib/waiting.ts
```

Новые (`??`/`A`, 7):

```
docs/releases/RELEASE-INSTRUCTIONS-v0.7.3.md
docs/releases/RELEASE-NOTES-v0.7.3.md
docs/releases/SCOPE-v0.7.3.json
scripts/e2e_backdate_waiting.ts
src/lib/attention-waiting.ts
src/lib/business-days.test.ts
src/lib/business-days.ts
```

Расхождение по числу/составу — стоп, чат агенту.

## Шаг 2. Коммит и пуш

```powershell
git add -A
git commit -m "release v0.7.3: D45 — невыбранный расчёт: мяч у клиента, плашка менеджеру через 2 рабочих дня (закрытие открытого вопроса DF-05)"
git push origin main
```

## Шаг 3. CI

Дождаться зелёного GitHub Actions (checks + integrity + e2e + заморозка). Красный — прислать лог агенту; откат `git revert HEAD --no-edit && git push`.

## Шаг 4. Vercel

Deployments → Ready (env не менялись — redeploy не требуется отдельно).

## Шаг 5. Пересчёт существующих запросов (рекомендуется)

Без миграций, но запросы, у которых уже есть ≥2 варианта без выбранного, получат плашку только после первого события по сделке. Чтобы показать её сразу — идемпотентный пересчёт (повтор безвреден):

```powershell
$env:DATABASE_URL = "<строка подключения к боевой базе Neon>"
npx tsx scripts/backfill_waiting.ts
```

Ожидаемый хвост: `Готово. Сменили kind: заявок N, запросов M.` Запросы с невыбранным расчётом получат `waitingSince = момент запуска` — эскалация «2 рабочих дня» пойдёт от него (решение №2 в RELEASE-NOTES-v0.7.3).

## Шаг 6. Smoke (прод)

1. `/api/health` — `{"status":"ok","db":"ok"}`.
2. Вход менеджера → запрос с **двумя** вариантами и без выбранного: плашка «Ждёт: клиента · N ч» (без хвоста «уточнить расчёт» — 2 рабочих дня ещё не прошли).
3. «Требует внимания» → секция «Ждут дольше N часов»: запросы с невыбранным расчётом старше 2 рабочих дней (после шага 5 они появятся там через 2 р.д. от запуска; проверить текст-действие можно, временно сдав порог `waiting.attention_hours` — строка всё равно требует 2 р.д.).
4. Выбрать вариант в запросе → плашка исчезла, строка из секции ушла.
5. Клиентский кабинет: waiting-объект у запроса по-прежнему не показывается (клиент выбирает вне системы), у заявки в «Согласовании» — прежнее «Ожидает вашего подтверждения».
