# RELEASE-INSTRUCTIONS v0.9.0 — DF-26 волна 2 «Разрешительные и принятие» (07.11.2026)

Владелец выполняет в PowerShell из клона `C:\PROJECTS\logix`. База — v0.8.6 (на проде). В релизе: **миграция `20261107120000_df_26_docs_center` (additive: 3 новые таблицы `PermitCheck`/`PermitCheckItem`/`PermitCheckRequirement` с CHECK и частичными уникальными индексами, +10 nullable-колонок и `bindingState` у `PermitRequirement`, 4 снимковые колонки у `Activity`/`DocumentVersion`; удалений и правок существующих колонок нет; бэкафилы — только из исторических снимков)**; env-переменных и новых зависимостей НЕТ — Redeploy вручную не нужен. Prisma Client с новыми моделями Vercel генерирует при сборке автоматически. Порядок: синхронизация клона → sha256 → распаковка → КТ1/КТ2 → пуш/CI → Vercel → миграция (протокол А) → контроль в NEON SQL Editor → smoke по ролям.

Статус по лестнице §6.1: пакет передан по запросу владельца на архив (D63); **приёмка гейта 2 DF-26 (§6.1 п. 4) и production deployment (§6.1 п. 5) — раздельные команды владельца**, выполнение инструкции — ваше собственное действие. Патч `ci-hotfix4-ic08-decisions.patch` применять НЕ нужно — исправленный `docs/DECISIONS.md` входит в архив (IC-08 на v0.9.0 зелёный без него); hotfix-правки v0.8.6 (CI-FIX 1–4) в архиве сохранены — распаковка их не откатывает.

## Шаг 0. Синхронизация клона (до распаковки!)

```powershell
git fetch origin
git status
```

Если ветка behind `origin/main` и локальных коммитов нет:

```powershell
git reset --hard origin/main
```

Если есть локальные коммиты или незавершённый rebase/merge — чат агенту, самому не мержить. `origin/main` — v0.8.6 hotfix 4 (коммит `fc6be5b`).

## Шаг 1. Проверка sha256 архива (КТ2a)

Архив приходит с суффиксом `_` (защита от платформенного фильтра zip). Рядом лежит `logix-v0.9.0.sha256` — сверка целостности ДО распаковки:

```powershell
Get-FileHash .\logix-v0.9.0.zip_ -Algorithm SHA256 | Format-List
Get-Content .\logix-v0.9.0.sha256
```

Хеш из первой строки вывода обязан совпасть со значением в файле (формат `sha256: …`). Не совпало — стоп, чат агенту (файл побился при передаче, перезалив).

## Шаг 2. Распаковка

```powershell
Rename-Item .\logix-v0.9.0.zip_ logix-v0.9.0.zip
Expand-Archive -Path .\logix-v0.9.0.zip -DestinationPath . -Force
```

## Шаг 3. Гигиена: удалений НЕТ — проверка

В отличие от v0.8.6, из проекта между релизами **ничего не удалялось**: архив — надмножество дерева `fc6be5b` (hotfix-правки 1–4 сохранены), удаляемых файлов нет. Проверка:

```powershell
git status --short | Select-String '^\s*D\s'
```

Пусто — хорошо. Если вывод непустой — стоп, чат агенту: список появившихся удалений в чат, самостоятельно ничего не удалять и не возвращать.

## Шаг 4. КТ1/КТ2 (перед коммитом)

**КТ1 — версия:**

```powershell
Select-String -Path .\package.json -Pattern '"version"'
```

Ожидается `"version": "0.9.0"`. Не совпало — стоп, чат агенту.

**КТ2 — состав:**

```powershell
git status --short
git status --short | Group-Object { $_[0] } | Select-Object Name, Count
```

Ориентир: **M 57, D 0, ?? 24** (±1–2 за счёт ваших локальных артефактов). Расхождение по НАЛИЧИЮ строк `src/…` или `prisma/…` — стоп, чат агенту. Ключевые позиции:

- **новые (24)** — `prisma/migrations/20261107120000_df_26_docs_center/migration.sql`; роуты разрешительных: `api/admin/permits/[id]/accept|reject`, `api/admin/permit-checks/[id]/review`, `api/{admin,broker}/{orders,leads}/[id]/permit-checks` (7 шт.); компоненты `src/components/admin/EmployeeRolesProvider.tsx`, `admin/order/StageOverrideDialog.tsx`, `documents/parts/RegistryCheckRow.tsx`; библиотеки `src/lib/permit-checks{,-db,-http}.ts`, `src/lib/api-request.ts`, `src/lib/estimate-diff-db.ts`, `src/lib/permit-checks.test.ts`; инфраструктура гейта `scripts/gate2_smoke.sh`, `gate2_fixture.py`, `gate2_final.sh`, `ic14_window.py`; релизный комплект `docs/releases/RELEASE-{NOTES,INSTRUCTIONS}-v0.9.0.md`, `SCOPE-v0.9.0.json`;
- **правки (57)** — `prisma/schema.prisma` (3 модели + 11 колонок), ядро `src/lib/permits{,-db}.ts`, convert-роут (подключение переноса проверок §10.3 п. 6), `estimate-diff-db.ts`-роуты оценки трёх кабинетов, `document-{confirm,lifecycle,package-server}.ts`, `event-registry.ts` (+9 событий), `events.ts`, `actor-name.ts`, `activity.ts`, `pulse{,-db}.ts`, `settings{,.test}.ts` (+ключ `permits.warn_days_before`, superset hotfix 4), `status-badges.ts`, `brokers.ts`, `stage-doc-requirements-server.ts`, `owner-digest{,.test}.ts`, `permit-checks{,-db}.ts`, роуты confirm/documents/package ×3 кабинета, `OrderStages.tsx`, `DocumentsRegistrySection.tsx`, части `Registry*`, `scripts/e2e_api_test.py` (блок w2 47 проверок), `scripts/integrity-baseline.json` (−2 устаревших), `CHANGELOG.md`, `package.json`, `.gitignore`, `docs/{ROADMAP,ROADMAP-DEALFLOW,DECISIONS,INVENTORY}.md`;
- **удаления (0)** — ни одного.

## Шаг 5. Коммит и пуш

```powershell
git add -A
git commit -m "release v0.9.0: DF-26 волна 2 «Разрешительные и принятие» — df_26_docs_center additive (PermitCheck/PermitCheckItem/PermitCheckRequirement с CHECK chk_permitcheck_one_target и частичными уникальными индексами uq_permitcheck_open_* NULLS NOT DISTINCT; PermitRequirement +10 nullable-колонок и bindingState с CHECK; двойные снимки Activity/DocumentVersion, бэкафил только из исторических снимков); загрузка по разрешительному → submitted «НА ПРОВЕРКЕ», решение сотрудника Принять/Отклонить с acceptedVersion и обязательной причиной (409 повтор, снимки в событиях), авто-закрытие при финализации, авто-возврат только ранее принятых при новой версии/«Вернуть в работу» (permit_reopened, подпись «ранее принята версия N»); дифф-сохранение оценки по id строки (чужой/дубль — 400 по D35 statusCode, ответ несёт id), смена кода — needs_review, удалённая позиция — pending_manual «ТРЕБУЕТ РУЧНОЙ ПРИВЯЗКИ», ручная привязка (permit_relinked); контур проверок ТН ВЭД: auto-записи с физической дедупликацией 23505, Требуется/Не требуется с основанием, пересмотр с решениями по каждому требованию (409 повтор); блокировка этапа по stageCode требований + override мастера (StageOverrideDialog, менеджер 403); permits.warn_days_before=7, Пульс/дайджест «документов ждут проверки»; события +9 с двойными снимками; UI: RegistryPermitRow/RegistryCheckRow, кнопки ≥44 десктоп+375, фильтр «Разрешительные» по стадиям; находки гейта устранены (гард брокера — companyId связи, EstimateDiffError — statusCode D35); vitest 586 (+23), e2e 687/690 (блок w2 47/47, 3 — подрядчик D31 вне объёма), tsc 0, build OK; миграция одна — df_26_docs_center additive"
git push origin main
```

GitHub Actions — дождаться **зелёного** CI. Красный — лог в чат агенту; откат `git revert HEAD --no-edit && git push` (только по согласованию).

## Шаг 6. Vercel

Deployments → дождаться **Ready**. Env-переменных в релизе нет — Redeploy вручную не требуется (Vercel деплоит новый коммит сама; Prisma Client с новыми моделями генерируется при сборке).

## Шаг 7. Миграция прода (протокол А, RULES 2.16)

**7.1. Preflight — снимок:** Neon → зафиксировать точку point-in-time restore ДО шага 7.2 (free-тариф: запомнить текущее время). Точка отсчёта документов (Neon SQL Editor):

```sql
SELECT "status", COUNT(*) AS cnt FROM "Document" GROUP BY "status" ORDER BY "status";
SELECT COUNT(*) AS docs_without_kind FROM "Document" WHERE "kind" IS NULL;
```

Числа запомнить — после миграции они обязаны совпасть (миграция существующие документы не трогает).

**7.2. Применить** (Node.js LTS установлен, D16; миграция additive — совместима с кодом 0.8.6, поэтому безопасно применять сразу после пуша, параллельно сборке Vercel):

```powershell
npx prisma@6 migrate deploy
```

Ожидаемый вывод: применяется `20261107120000_df_26_docs_center`. До применения миграции новый код видимых отличий не даёт (новые таблицы кодом не читаются до появления проверок/загрузок) — окно безопасно.

**7.3. КТ3 — последняя применённая (Neon SQL Editor):**

```sql
SELECT "migration_name" FROM "_prisma_migrations" ORDER BY "started_at" DESC LIMIT 1;
```

Ожидается: `20261107120000_df_26_docs_center`.

**7.4. КТ4 — новые таблицы и колонки (Neon SQL Editor):**

```sql
SELECT
  (SELECT COUNT(*) FROM "PermitCheck")            AS permit_checks,
  (SELECT COUNT(*) FROM "PermitCheckItem")        AS permit_check_items,
  (SELECT COUNT(*) FROM "PermitCheckRequirement") AS permit_check_requirements,
  (SELECT COUNT(*) FROM "PermitRequirement" WHERE "bindingState" = 'pending_manual') AS pending_manual,
  (SELECT COUNT(*) FROM "PermitRequirement" WHERE "status" = 'submitted')            AS submitted;
```

Ожидается: `0 / 0 / 0 / 0 / 0` — таблицы созданы пустыми, существующие строки requirements все `bound` и не в `submitted` (это состояние появится после первых загрузок на новом коде).

```sql
SELECT "bindingState", COUNT(*) AS cnt FROM "PermitRequirement" GROUP BY "bindingState";
```

Ожидается одна строка: `bound` (все исторические требования привязаны).

**7.5. КТ5 — бэкафил снимков (Neon SQL Editor):**

```sql
SELECT COUNT(*) AS activity_total,
       COUNT(*) FILTER (WHERE "actorUserName" IS NOT NULL OR "actorCompanyName" IS NOT NULL) AS snapshots_filled
FROM "Activity";
SELECT COUNT(*) AS received_total,
       COUNT(*) FILTER (WHERE "acceptedVersion" IS NOT NULL) AS accepted_v_backfilled
FROM "PermitRequirement" WHERE "status" = 'received';
```

Ожидается: `snapshots_filled` = числу исторических событий с непустым `actorName` (бэкафил по типу участника: client/broker → компания, employee/contractor/system → имя); `accepted_v_backfilled` ≤ `received_total` — заполнено только там, где у документа была ровно одна готовая версия (честная деградация §10.3, остальные NULL — это норма). Контроль данных — снимок из шага 7.1 обязан совпасть:

```sql
SELECT "status", COUNT(*) AS cnt FROM "Document" GROUP BY "status" ORDER BY "status";
```

## Шаг 8. Smoke на проде (по ролям, RULES 2.16)

1. `/api/health` → `{"status":"ok","db":"ok"}`.
2. Вход ×3 кабинета (сотрудник, клиент, брокер).
3. **Клиент** (или сотрудник в строке требования): в карточке заявки с разрешительным требованием → загрузить документ из строки → строка перешла в «**НА ПРОВЕРКЕ**» (не «ПОЛУЧЕН» — это ключевое изменение волны 2), файл в реестре, в ленте события — запись о передаче на проверку.
4. **Сотрудник** (десктоп 1440): строка «НА ПРОВЕРКЕ» с кнопками «Принять / Отклонить / Править»; «Отклонить» без причины — валидация (причина обязательна); с причиной → строка вернулась в «ОЖИДАЕТСЯ», причина — в журнале сделки; после повторной загрузки «Принять» → «ПОЛУЧЕН», у строки версия принятого документа.
5. **Авто-возврат:** у принятого требования нажать «Новая версия» в карточке документа и загрузить новый файл → строка снова «НА ПРОВЕРКЕ» с подписью «ранее принята версия N» (кто, дата).
6. **Проверка ТН ВЭД** (если в оценке есть позиция с кодом): в фазе 07 строка «ТРЕБУЕТ УТОЧНЕНИЯ» — у сотрудника и у брокера своей сделки; «Не требуется» без основания — 400, с основанием — строка закрыта со снимком сотрудника. Если кодов в оценках нет — записи появятся при первом появлении кода (контроль в NEON: `SELECT COUNT(*) FROM "PermitCheck"`).
7. **Дифф-оценка:** брокер правит оценку (удаляет позицию, на которую ссылается требование) → у сотрудника требование «ТРЕБУЕТ РУЧНОЙ ПРИВЯЗКИ»; ручная привязка на актуальную строку — метка снята, событие в журнале.
8. **Блокировка этапа:** попытка завершить этап, к которому привязано незакрытое требование, → 400/409 с перечнем требований; обход — только мастер (диалог override с комментарием); менеджер — 403.
9. **Настройки/Пульс:** Настройки — ключ «Разрешительные: предупреждать за N дней» = 7; Пульс — блок «документов ждут проверки» сходится с реестром.
10. **Мобильный 375 (владелец с телефона):** карточка требования — кнопки «Принять/Отклонить» нажимаются (цель ≥44×44), фазы карточками, «Добавить документ» доступна.
11. **Регресс ZIP:** «Скачать все документы» → диалог с точными счётчиками → ZIP со структурой фаз (как в 0.8.6).
12. Тестовый документ перевести в финальные/удалить по итогам смоука.

## Откат

Vercel → Deployments → **Promote** предыдущего деплоя (0.8.6), затем `git revert HEAD --no-edit && git push`. Базу откатывать НЕ нужно, если после выката не было бизнес-записей в новом контуре (проверка: запрос КТ4 — всё ещё нули): код 0.8.6 новые таблицы/колонки не читает, данным ничего не грозит. **Если бизнес-записи уже есть** (требования в «НА ПРОВЕРКЕ», проверки, привязки) — код 0.8.6 не знает статуса `submitted`: перед откатом привести требования к известным 0.8.6-статусам (`UPDATE "PermitRequirement" SET "status"='pending' WHERE "status"='submitted';` — снимки `submitted*` сохраняются в колонках, данные не теряются) и согласовать с агентом чат; новые таблицы оставляются (заморозка §10.3 п. 5.2) или архивируются по протоколу из отчёта гейта 2 (§8). Обратной миграции нет.
