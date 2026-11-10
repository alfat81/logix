# RELEASE-INSTRUCTIONS v0.9.1 — Поток A волна 2 (DF-25): AUD-03 + BL-8/BL-9 + AUD-04/05/08/12 (08.11.2026)

Владелец выполняет в PowerShell из клона `C:\PROJECTS\logix`. База — **v0.9.0 (на проде, commit `436072f`)**. В релизе: **миграция `20261108120000_bl_phone_ops` (additive: уникальный индекс `CustomerUser_phone_key` на `CustomerUser.phone` + 4 nullable-колонки `pendingPhone`/`phoneCodeHash`/`phoneCodeExpiresAt`/`phoneCodeAttempts`)** — перед её применением **ОБЯЗАТЕЛЬНАЯ предпроверка дублей телефонов в NEON SQL Editor (шаг 8)**: при дублях миграция не применяется, разбор с агентом. Env-переменных и новых зависимостей НЕТ — Redeploy вручную не нужен. Prisma Client Vercel генерирует при сборке. Порядок: синхронизация клона → sha256 → распаковка + гигиена → КТ1/КТ2 → пуш/CI → Vercel → предпроверка дублей → миграция (протокол А) → контроль в NEON SQL Editor → smoke по ролям.

Статус по лестнице §6.1: пакет v0.9.1 передан по заказу владельца (D68 — «выдавай архив для деплоя и инструкции»); **приёмка гейта волны 2 и production deployment — раздельные команды владельца**; выполнение инструкции — ваше собственное действие.

**Пакет `download/logix-v0.9.0-DOCS-SYNC/` применять НЕ нужно** — его содержимое (запись D64 «CI-фикс + production deployment» и история роадмапа 1.20) уже включено в журнал этого релиза; повторное применение создаст дубль записи D64.

## Шаг 0. Синхронизация клона (до распаковки!)

```powershell
git fetch origin
git status
```

`origin/main` — `436072f` (v0.9.0 hotfix). Если ветка behind и локальных коммитов нет:

```powershell
git reset --hard origin/main
```

Если есть локальные коммиты или незавершённый rebase/merge — чат агенту, самому не мержить.

## Шаг 1. Проверка sha256 архива

Архив приходит с суффиксом `_` (защита от платформенного фильтра zip). Рядом лежит `logix-v0.9.1.sha256`:

```powershell
Get-FileHash .\logix-v0.9.1.zip_ -Algorithm SHA256 | Format-List
Get-Content .\logix-v0.9.1.sha256
```

Хеш из первой строки вывода обязан совпасть со значением в файле. Не совпало — стоп, чат агенту (файл побился при передаче, перезалив).

## Шаг 2. Распаковка

```powershell
Rename-Item .\logix-v0.9.1.zip_ logix-v0.9.1.zip
Expand-Archive -Path .\logix-v0.9.1.zip -DestinationPath . -Force
```

## Шаг 3. Гигиена: удалить 3 файла, оставшихся от v0.9.0

В дереве v0.9.1 эти файлы отсутствуют (в волнах потока A их роль закрыта: `api-request.ts` — хелпер распаковки тела запроса из линии v0.9.0, в текущем дереве гард-блоки маршрутов сведены без него; два скрипта — одноразовые утилиты гейта 2 DF-26). `Expand-Archive` их не удаляет — без этого шага CI-knip найдёт неиспользуемый файл и встанет красным:

```powershell
$stale = @(
  'src/lib/api-request.ts',
  'scripts/gate2_final.sh',
  'scripts/ic14_window.py'
)
$stale | ForEach-Object { if (Test-Path $_) { Remove-Item $_ -Force; Write-Host "удалён $_" } }
Write-Host "Гигиена: удаление завершено"
```

Историческая ссылка на `api-request.ts` в `docs/releases/RELEASE-INSTRUCTIONS-v0.9.0.md` остаётся как есть — это документ истории релизов (отмечено в integrity-baseline, как 19 исторических ссылок v0.8.6).

## Шаг 4. КТ1/КТ2

**КТ1 — версия:**

```powershell
Select-String -Path .\package.json -Pattern '"version"'
```

Ожидается `"version": "0.9.1"`.

**КТ2 — состав (перед коммитом):**

```powershell
git status --short
git status --short | Group-Object { $_[0] } | Select-Object Name, Count
```

Ориентир: **M 22, D 3, ?? 4** (±1–2 за счёт ваших локальных артефактов). Ключевые позиции: **новые** — `prisma/migrations/20261108120000_bl_phone_ops/migration.sql`, `scripts/precheck_phone_dupes.sql`, `src/components/admin/CustomerPhoneChangeDialog.tsx`, `CustomerRebindDialog.tsx`, роуты `access/phone-change`, `access/phone-confirm`, `access/rebind`, `src/lib/customer-user-ops.test.ts`, `dispatch-lease.test.ts`, `docs/releases/RELEASE-{NOTES,INSTRUCTIONS}-v0.9.1.md`, `SCOPE-v0.9.1.json`; **правки** — `prisma/schema.prisma`, `src/lib/company-users.ts` (+347), `totp-db.ts`, `notifications/dispatch.ts`, `retry.ts`, `activity.ts`, `event-registry.ts`, роуты `access`, `profile/totp`, `notifications/[id]/retry`, UI `CustomerCabinetAccess.tsx`, `CustomerUserDialog.tsx`, `NotificationsJournal.tsx`, `ProfileTotpSection.tsx`, `DEPLOY.md` (§4.4), `scripts/e2e_api_test.py`, `integrity-baseline.json`, `knip-baseline.json`, `CHANGELOG.md`, `package.json`, `docs/ROADMAP.md`, `ROADMAP-DEALFLOW.md` (1.23), `DECISIONS.md` (единая линия D62–D68), `INVENTORY.md`; **удаления** — ровно 3 файла из блока шага 3.

## Шаг 5. Коммит и пуш

```powershell
git add -A
git commit -m "release v0.9.1: поток A волна 2 (DF-25) — bl_phone_ops additive (уникальный индекс CustomerUser.phone_key — AUD-03 глобальная уникальность, вход по телефону детерминирован; +pendingPhone/phoneCodeHash/phoneCodeExpiresAt/phoneCodeAttempts), BL-8 смена телефона двухшаговой операцией (одноразовый код: sha256-хеш, TTL 15 мин, лимит 5, атомарный захват паттерном AUD-04; ручной режим manual_by_manager до шлюза P2-01; PATCH доступа больше не принимает phone), BL-9 перепривязка к другой компании (не-primary, активная целевая, гашение всех сессий, событие customer_user_rebound), AUD-04 антиповтор TOTP-кода (атомарный захват шага, count===1), AUD-05 диспетчер: лиз-захват pending→sending 15 мин + условные итоговые записи + автовосстановление зависших (stuck_sending / stuck_sending_recovered) + retry по sending, AUD-08 пароль при включении TOTP (симметрия с выключением), AUD-12 гигиена DF-14 (StageRequirementsDialog <=300, INVENTORY); vitest 629 (+66), e2e 744/3 (блок волны 22/22, все 3 вне объёма), tsc 0, build OK, integrity 0/0, knip 45=45; миграция одна — bl_phone_ops additive"
git push origin main
```

GitHub Actions — дождаться **зелёного** CI. Красный — лог в чат агенту; откат `git revert HEAD --no-edit && git push` (только по согласованию).

## Шаг 6. Vercel

Deployments → дождаться **Ready**. Env-переменных в релизе нет — Redeploy вручную не требуется.

## Шаг 7. Предпроверка дублей телефонов (ОБЯЗАТЕЛЬНО, до миграции)

**Neon → SQL Editor** (или psql к прод-строке), read-only:

```sql
SELECT phone, count(*)::int AS cnt,
       string_agg(id || ' (' || coalesce(name, 'без имени') || ', companyId=' || company_id || ')', '; ') AS entries
FROM "CustomerUser"
WHERE phone IS NOT NULL
GROUP BY phone
HAVING count(*) > 1;
```

- **0 строк (ожидается)** — дублей нет, идите на шаг 8.
- **Есть строки** — **СТОП: миграцию НЕ применять** (`CREATE UNIQUE INDEX` упадёт или оставит систему без уникальности). Чат агенту: разбор с владельцем по плану §5.1 п. 2 (оставляем самый старый вход, остальные деактивируем), только после чистки — шаг 8. Тот же запрос — `scripts/precheck_phone_dupes.sql`.

## Шаг 8. Миграция прода (протокол А, RULES 2.16)

**8.1. Снимок:** Neon → зафиксировать точку point-in-time restore ДО шага 8.2 (free-тариф: запомнить текущее время).

**8.2. Применить** (Node.js LTS установлен, D16; миграция additive — совместима с кодом v0.9.0, поэтому безопасно применять сразу после пуша, параллельно сборке Vercel):

```powershell
npx prisma@6 migrate deploy
```

Ожидаемый вывод: `1 migration found in prisma/migrations` → применяется `20261108120000_bl_phone_ops`. До миграции единственное видимое отличие нового кода — кнопки «Изменить телефон»/«Перепривязать» отвечают ошибкой (минуты, ожидаемо).

**8.3. КТ3 — последняя применённая (Neon SQL Editor):**

```sql
SELECT "migration_name" FROM "_prisma_migrations" ORDER BY "started_at" DESC LIMIT 1;
```

Ожидается: `20261108120000_bl_phone_ops`.

**8.4. КТ4 — уникальный индекс (Neon SQL Editor):**

```sql
SELECT "indexname", "indexdef" FROM "pg_indexes"
WHERE "tablename" = 'CustomerUser' AND "indexname" LIKE '%phone%';
```

Ожидается строка `CustomerUser_phone_key` с `CREATE UNIQUE INDEX ... ON "CustomerUser" USING btree ("phone")`.

**8.5. КТ5 — pending-колонки и чистота (Neon SQL Editor):**

```sql
SELECT count(*)::int AS users, count("pendingPhone")::int AS pending,
       count("phoneCodeHash")::int AS codes_in_db
FROM "CustomerUser";
```

Ожидается: `codes_in_db = 0` (коды в БД не хранятся — только хеши во время 15-минутной заявки), `pending = 0` сразу после релиза (заявок ещё нет). Число `users` — как до миграции (миграция данные не трогает).

## Шаг 9. Smoke на проде (по ролям)

1. `/api/health` → `{"status":"ok","db":"ok"}`.
2. Вход ×3 кабинета (сотрудник, клиент, брокер).
3. **Сотрудник** — Карточка компании → Доступ: «Выдать доступ» с телефоном, который уже занят пользователем ДРУГОЙ компании → 409 «Этот телефон уже занят пользователем другой компании» (AUD-03).
4. **Сотрудник** — «Изменить телефон» у не-основного пользователя: новый номер → диалог показывает 6-значный код с инструкцией «сообщите клиенту по телефону/мессенджеру» (ручной режим) → ввести неверный код → отказ, счётчик попыток; ввести верный → телефон изменён, в журнале событие «Телефон пользователя компании изменён» с указанием кто/старый → новый/режим; пользователь по новому номеру входит, старый больше нет.
5. **Сотрудник** — PATCH-правка пользователя с изменением поля телефона напрямую → 400 с подсказкой «Используйте операцию „Изменить телефон"» (контрактное сужение).
6. **Сотрудник** — «Перепривязать к другой компании» у не-основного пользователя: предупреждение «Пользователь потеряет доступ к данным {старая компания}; история сохранится» → подтвердить → в списке новой компании появился; открытая вкладка старой компании при следующем действии выбрасывает на вход (сессии погашены); для основного пользователя кнопка перепривязки даёт 409.
7. **Сотрудник** — профиль → Безопасность: включение TOTP без пароля невозможно (поле обязательное); с неверным паролем — отказ; с верным — 10 кодов восстановления.
8. **Мастер** — Журнал отправок: повтор строк работает как прежде; зависших `sending` в очереди нет (если была — через ≤15 мин вернулась в очередь или failed с пометкой `stuck_sending`).
9. Тестовые изменения удалить/отменить (пользователь созданный для smoke — деактивировать).

## Откат

Vercel → Deployments → **Promote** предыдущего деплоя (v0.9.0), затем `git revert HEAD --no-edit && git push`. Базу откатывать НЕ нужно: миграция additive — код v0.9.0 не читает новые колонки и не препятствует уникальному индексу (вход по телефону в v0.9.0 и так требовал уникальности семантикой lib); обратной миграции нет и она не требуется. Зависшие строки `sending` при откате: старый код игнорирует их как «не pending» — вернуть в работу вручную:

```sql
UPDATE "Notification" SET "status" = 'pending', "lastError" = 'rollback_from_sending'
WHERE "status" = 'sending';
```
