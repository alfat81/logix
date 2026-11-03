# RELEASE-INSTRUCTIONS v0.8.4 — DF-12 «Виды документов, статус „финальный"» (03.11.2026)

Владелец выполняет в PowerShell из клона `C:\PROJECTS\logix`. База — v0.8.3 (на проде, деплой зелёный, смоук DF-11 закрыт). В релизе: **миграция `df_12_document_lifecycle` (additive: новые колонки `Document` + backfill вида, удаления нет)**. Новых env-переменных и зависимостей НЕТ — Redeploy вне конвейера не нужен. Порядок строгий: синхронизация клона → распаковка → КТ1/КТ2 → sha256 → пуш/CI → миграция (протокол А) → smoke по ролям.

## Шаг 0. Синхронизация клона (до распаковки!)

```powershell
git fetch origin
git status
```

Если ветка behind `origin/main` и локальных коммитов нет:

```powershell
git reset --hard origin/main
```

Если есть локальные коммиты или незавершённый rebase/merge — чат агенту, самому не мержить. `origin/main` — v0.8.3 (коммит 026feb2).

## Шаг 1. Проверка sha256 архива (KT2a)

Архив приходит с суффиксом `_` (защита от платформенного фильтра zip). Рядом лежит `logix-v0.8.4.sha256` — сверка целостности ДО распаковки:

```powershell
Get-FileHash .\logix-v0.8.4.zip_ -Algorithm SHA256 | Format-List
Get-Content .\logix-v0.8.4.sha256
```

Хеш из первой строки вывода обязан совпасть со значением в файле (формат `sha256: 0e5b...`). Не совпало — стоп, чат агенту (файл побился при передаче, перезалив).

## Шаг 2. Распаковка

```powershell
Rename-Item .\logix-v0.8.4.zip_ logix-v0.8.4.zip
Expand-Archive -Path .\logix-v0.8.4.zip -DestinationPath . -Force
```

**КТ1 — версия:**

```powershell
Select-String -Path .\package.json -Pattern '"version"'
```

Ожидается `"version": "0.8.4"`. Не совпало — стоп, чат агенту.

**КТ2 — состав (перед коммитом):**

```powershell
git status --short
```

Состав «ожидается» (расхождение по НАЛИЧИЮ строк `src/…` — стоп, чат агенту): **новые файлы** — `src/lib/document-lifecycle.ts`, `src/lib/document-constants.test.ts`, `src/components/documents/parts/DocumentLifecycle.tsx`, `src/app/api/admin/documents/[id]/finalize/route.ts`, `src/app/api/admin/documents/[id]/reopen/route.ts`, `prisma/migrations/20261103000000_df_12_document_lifecycle/migration.sql`, `docs/releases/RELEASE-NOTES-v0.8.4.md`, `docs/releases/RELEASE-INSTRUCTIONS-v0.8.4.md`, `docs/releases/SCOPE-v0.8.4.json`; **правки** — `src/lib/document-constants.ts`, `document-upload.ts`, `documents.ts`, `activity.ts`, `event-registry.ts`, `events.test.ts`, `status-machine.ts`, `status-machine.test.ts`, `status-badges.ts`; `src/components/documents/DocumentsSection.tsx`, `src/components/documents/parts/types.ts`, `parts/DocumentCreateDialog.tsx`; `src/components/admin/LeadCard.tsx`, `src/components/admin/order/OrderSidePanel.tsx`; `src/app/api/{admin,client,broker}/permits/[id]/document/route.ts`; `prisma/schema.prisma`; `scripts/e2e_api_test.py`, `scripts/knip-baseline.json`; `docs/ROADMAP.md`, `docs/ROADMAP-DEALFLOW.md`, `docs/DEPRECATIONS.md`, `docs/INVENTORY.md`; `CHANGELOG.md`, `package.json`.

## Шаг 3. Коммит и пуш

```powershell
git add -A
git commit -m "release v0.8.4: DF-12 виды документов и жизненный цикл — справочник DOCUMENT_KINDS (15 видов по D5, группы фаз), df_12_document_lifecycle additive (kind + backfill из type, status draft|in_review|final, снимок финализации, stageCode — задел DF-13/14), финализация только сотрудником (finalize/reopen, возврат с обязательной причиной в журнал), версия поверх финала 409, события document_finalized/reopened в транзакции, UI: выбор вида группами, бейджи §3.2, кнопки у сотрудников; легаси type — производный (DEPRECATIONS 0.9.0); vitest 466 (+15), e2e 558 (+26)"
git push origin main
```

GitHub Actions — дождаться **зелёного** CI. Красный — лог в чат агенту; откат `git revert HEAD --no-edit && git push` (только по согласованию).

## Шаг 4. Vercel

Deployments → дождаться **Ready**. Новых env-переменных в релизе нет — Redeploy вручную не требуется (Vercel деплоит новый коммит сама). Если на этом шаге что-то меняли в Settings → Environment Variables (вне этого релиза) — тогда Redeploy (RULES 2.3).

## Шаг 5. Миграция прода (протокол А, RULES 2.16 шаг 5)

**5.1. Снимок:** Neon → зафиксировать точку point-in-time restore ДО шага 5.2 (free-тариф: запомнить текущее время).

**5.2. Применить** (Node.js LTS установлен, D16; миграция additive — новые nullable-колонки и UPDATE backfill, совместима с кодом 0.8.3 — прежняя версия продолжает работать):

```powershell
npx prisma@6 migrate deploy
```

Ожидаемый вывод: `1 migration found in prisma/migrations` → применяется `20261103000000_df_12_document_lifecycle`. Новых моделей в релизе нет (только колонки существующей таблицы) — `prisma generate` НЕ нужен.

**5.3. КТ3 — последняя применённая (не PowerShell — Neon SQL Editor):**

```sql
SELECT "migration_name" FROM "_prisma_migrations" ORDER BY "started_at" DESC LIMIT 1;
```

Ожидается: `20261103000000_df_12_document_lifecycle`.

**5.4. Backfill-контроль (не PowerShell — Neon SQL Editor):** после миграции у всех документов заполнен вид:

```sql
SELECT COUNT(*) AS "без вида" FROM "Document" WHERE "kind" IS NULL;
```

Ожидается `0`. Не ноль — чат агенту (не выполнять повторно ничего самостоятельно).

## Шаг 6. Smoke на проде (по ролям, RULES 2.16 шаг 5.3)

1. `/api/health` → `{"status":"ok","db":"ok"}`.
2. Вход ×4 кабинета (сотрудник, клиент, брокер, подрядчик).
3. **Сотрудник** — карточка заявки → вкладка «Документы»: существующие документы имеют вид («Инвойс», «Разрешительный документ», «Прочее» — по легаси-типу) и статус «Черновик»; «Загрузить документ» — в диалоге выбор **вида** (группы «Расчёт / Оформление и перевозка / Заявки и договоры / Прочее»). Загрузить тестовый PDF (вид «Прочее») → появилась кнопка **«Финальный»** → нажать → статус-бейдж «Финальный» с замком, кнопки «Новая версия» больше нет, появилась строка «Финальная версия v1 · <имя> · <дата>» и кнопка «Вернуть в работу».
4. «Вернуть в работу» без причины — кнопка заблокирована; с причиной — статус «На проверке», в ленте события «Документ финализирован» и «Документ возвращён в работу: <причина>». Загрузить вторую версию → снова «Финальный» → строка показывает v2.
5. **Клиент** (свой кабинет): документ виден со статусом, кнопок «Финальный»/«Вернуть в работу» и удаления НЕТ; тестовый файл скачивается.
6. **Брокер**: аналогично — статус виден, действий жизненного цикла нет.
7. Удалить тестовые данные: документ — кнопка «Удалить» (сотрудник), сообщение из ленты не трогаем.

## Откат

Vercel → Deployments → **Promote** предыдущего деплоя (код 0.8.3 совместим со схемой после миграции — колонки additive). Затем `git revert HEAD --no-edit && git push`. Базу откатывать НЕ нужно: колонки nullable/с-дефолтом, старый код их не читает.
