# RELEASE-INSTRUCTIONS v0.7.2 — DF-05 «У кого мяч»

Владелец выполняет в PowerShell из клона `C:\PROJECTS\logix`. База — v0.7.1. Миграция additive; новых env нет; новых зависимостей нет.

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
Expand-Archive -Path .\logix-v0.7.2.zip -DestinationPath . -Force
```

**КТ1 — версия:**

```powershell
Select-String -Path .\package.json -Pattern '"version"'
```

Ожидается `"version": "0.7.2"`. Не совпало — стоп, чат агенту.

**КТ2 — состав (перед коммитом):**

```powershell
git status --short
```

Ожидается 32 файла. Изменённые (`M`, 23):

```
CHANGELOG.md
docs/INVENTORY.md
docs/ROADMAP-DEALFLOW.md
docs/ROADMAP.md
knip.json
package.json
prisma/schema.prisma
scripts/e2e_api_test.py
scripts/integrity-baseline.json
src/app/admin/(dashboard)/orders/[id]/page.tsx
src/app/api/admin/attention/route.ts
src/app/api/admin/orders/route.ts
src/app/api/client/orders/[id]/route.ts
src/components/admin/AttentionScreen.tsx
src/components/admin/LeadCard.tsx
src/components/admin/LeadListCard.tsx
src/components/admin/OrderCard.tsx
src/components/admin/attention/AttentionSections.tsx
src/components/admin/attention/types.ts
src/components/admin/lead/types.ts
src/components/admin/order/types.ts
src/components/client/ClientOrderCard.tsx
src/lib/events.ts
```

Новые (`??`/`A`, 9):

```
docs/releases/RELEASE-INSTRUCTIONS-v0.7.2.md
docs/releases/RELEASE-NOTES-v0.7.2.md
docs/releases/SCOPE-v0.7.2.json
prisma/migrations/20261030051423_df_05_waiting/migration.sql
scripts/backfill_waiting.ts
src/components/admin/WaitingBadge.tsx
src/lib/waiting-db.ts
src/lib/waiting.test.ts
src/lib/waiting.ts
```

Расхождение по числу/составу — стоп, чат агенту.

## Шаг 2. Коммит и пуш

```powershell
git add -A
git commit -m "release v0.7.2: DF-05 «У кого мяч» — вычисляемое ожидание сделки (waitingOn, секция внимания, нейтральная плашка клиенту)"
git push origin main
```

## Шаг 3. CI

Дождаться зелёного GitHub Actions (checks + integrity + e2e). Красный — прислать лог агенту; откат `git revert HEAD --no-edit && git push`.

## Шаг 4. Vercel

Deployments → Ready (env не менялись — redeploy не требуется отдельно).

## Шаг 5. Миграция (протокол А, D16)

1. **До** — Neon branch-снимок (или зафиксировать точку point-in-time restore).
2. В клоне (архив уже распакован, КТ1 пройден):

```powershell
npx prisma@6 migrate deploy
npx prisma@6 generate
```

   `generate` обязателен: `migrate deploy` не перегенерирует Prisma Client (урок v0.6.8) — он нужен для шага 6 (скрипт backfill использует новые поля).
3. Проверка:

```powershell
npx prisma@6 migrate status
```

   Ожидается: последняя применённая — `20261030051423_df_05_waiting`.
4. Резерв (если Node недоступен): Neon SQL Editor — содержимое `prisma/migrations/20261030051423_df_05_waiting/migration.sql`, затем регистрация в `_prisma_migrations` (блок запросит агент).

## Шаг 6. Backfill-пересчёт ожидания

Заполняет waitingOn* у существующих заявок и запросов (до него у всех NULL — плашки не показываются). Идемпотентен: повторный запуск безвреден.

```powershell
$env:DATABASE_URL = "<строка подключения к боевой базе Neon>"
npx tsx scripts/backfill_waiting.ts
```

Ожидаемый хвост вывода: `Готово. Сменили kind: заявок N, запросов M.` (N/M — сколько сделок получили первый kind).

## Шаг 7. Smoke (прод)

1. `/api/health` — `{"status":"ok","db":"ok"}`.
2. Вход ×4 кабинета (мастер, менеджер, клиент, брокер).
3. «Заявки» — у активных карточек плашка «Ждёт: …» (например, «Ждёт: перевозчика · N ч»).
4. Создать пустой запрос — плашка «Ждёт: клиента»; внести описание груза — «Ждёт: менеджера».
5. «Требует внимания» — секция «Ждут дольше 24 часов» присутствует (пустая на свежих данных — это норма).
6. Кабинет клиента: заявка в «Согласовании» — «Ожидает вашего подтверждения».
