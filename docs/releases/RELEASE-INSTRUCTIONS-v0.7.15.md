# RELEASE-INSTRUCTIONS v0.7.15 — DF-23: фикс потери полей при конверсии «запрос → заявка» (31.10.2026)

Владелец выполняет в PowerShell из клона `C:\PROJECTS\logix`. База — v0.7.14 (уже на проде, деплой зелёный). В релизе: **нет миграций, нет новых env, нет новых зависимостей**; правки кода конверсии и кабинетов (client/broker) + охрана (unit, e2e) + реестры/доки. После выкатки — **одноразовое SQL-выравнивание ТН ВЭД** (шаг 6) и smoke по ролям (шаг 7).

## Шаг 0. Синхронизация клона (до распаковки!)

```powershell
git fetch origin
git status
```

Если ветка behind `origin/main` и локальных коммитов нет:

```powershell
git reset --hard origin/main
```

Если есть локальные коммиты или незавершённый rebase/merge — чат агенту, самому не мержить. `origin/main` — v0.7.14 (деплой зелёный).

## Шаг 1. Распаковка архива

Архив из выдачи приходит с суффиксом `_` — сначала переименовать (если файл уже называется `logix-v0.7.15.zip` — пропустите Rename-Item):

```powershell
Rename-Item .\logix-v0.7.15.zip_ logix-v0.7.15.zip
Expand-Archive -Path .\logix-v0.7.15.zip -DestinationPath . -Force
```

**КТ1 — версия:**

```powershell
Select-String -Path .\package.json -Pattern '"version"'
```

Ожидается `"version": "0.7.15"`. Не совпало — стоп, чат агенту.

## Шаг 2. Коммит и пуш

**КТ2 — состав (перед коммитом):**

```powershell
git status --short
```

Ожидается **27 изменённых** (`M`) и **3 новых** (`??`):

```
M  CHANGELOG.md
M  docs/DEPRECATIONS.md
M  docs/INVENTORY.md
M  docs/ROADMAP.md
M  docs/ROADMAP-DEALFLOW.md
M  package.json
M  scripts/e2e_api_test.py
M  src/app/admin/(dashboard)/orders/[id]/page.tsx
M  src/app/api/admin/leads/[id]/convert/route.ts
M  src/app/api/admin/orders/[id]/patch.ts
M  src/app/api/broker/leads/[id]/route.ts
M  src/app/api/broker/leads/route.ts
M  src/app/api/broker/orders/[id]/route.ts
M  src/app/api/broker/orders/route.ts
M  src/app/api/client/leads/[id]/route.ts
M  src/app/api/client/leads/route.ts
M  src/app/api/client/orders/[id]/route.ts
M  src/app/api/client/orders/route.ts
M  src/components/broker/BrokerHome.tsx
M  src/components/broker/BrokerLeadCard.tsx
M  src/components/broker/BrokerOrderCard.tsx
M  src/components/client/ClientHome.tsx
M  src/components/client/ClientOrderCard.tsx
M  src/lib/convert-atomic.test.ts
M  src/lib/lead-edit.ts
M  src/lib/orders.ts
M  src/lib/route-fields.ts
?? docs/releases/RELEASE-INSTRUCTIONS-v0.7.15.md
?? docs/releases/RELEASE-NOTES-v0.7.15.md
?? docs/releases/SCOPE-v0.7.15.json
```

Расхождение по числу/составу — стоп, чат агенту.

```powershell
# Одинарные кавычки PowerShell: внутри НЕ должно быть двойных и
# типографских (кавычки-ёлочки и пр.) — урок v0.7.4.
git add -A
git commit -m 'release v0.7.15: DF-23 фикс потери полей при конверсии запрос-заявка (находка владельца на проде 0.7.14): конверсия переносит incotermPlace и incotermCode (тело приоритетно, пусто — код с лида); route-колонки в select/ответах и UI кабинетов клиента и брокера (общие ROUTE_COLUMN_SELECT/routeLineOf); ТН ВЭД — одна точка правки: бланк синхронизирует колонку hsCode (hsCodePatch), при конверсии колонка с бланка; Место поставки рядом с Инкотермс (админка, брокер); легаси-пара incoterm — в DEPRECATIONS; охрана: unit маппинга + e2e-секция DF-23; повторный аудит по ролям после правок — потери 1-4 и дубль 1 устранены; vitest 432, e2e 510'
git log --oneline -2
git push origin main
```

`git log --oneline -2` обязан показать верхним `release v0.7.15: …`. Не показал — стоп, чат агенту.

## Шаг 3. CI

Дождаться зелёного GitHub Actions (checks + integrity + e2e + заморозка + gitleaks). Красный — прислать лог агенту; откат `git revert HEAD --no-edit && git push`.

## Шаг 4. Vercel

Deployments → Ready. Новых env нет, Redeploy не требуется.

## Шаг 5. SQL — разовое выравнивание ТН ВЭД (выполнить РОВНО ОДИН РАЗ)

До 0.7.15 колонка `Order.hsCode` и ключ бланка `cargoInfo.hsCode` могли расходиться. С 0.7.15 колонку ведёт бланк (одна точка правки); историческое расхождение закрывается одним SQL на прод-базе (Vercel → Storage → Postgres → Query, или `psql $DATABASE_URL`):

```sql
-- 1) бланк непуст → колонка (бланк — источник правды)
UPDATE "Order"
SET "hsCode" = NULLIF(BTRIM("cargoInfo"->>'hsCode'), '')
WHERE "cargoInfo" IS NOT NULL
  AND COALESCE(BTRIM("cargoInfo"->>'hsCode'), '') <> ''
  AND NULLIF(BTRIM("cargoInfo"->>'hsCode'), '') IS DISTINCT FROM "hsCode";

-- 2) бланк пуст, колонка непуста → код возвращается в бланк (данные не теряются)
UPDATE "Order"
SET "cargoInfo" = jsonb_set("cargoInfo", '{hsCode}', to_jsonb("hsCode"))
WHERE "cargoInfo" IS NOT NULL
  AND JSONB_TYPEOF("cargoInfo") = 'object'
  AND COALESCE(BTRIM("cargoInfo"->>'hsCode'), '') = ''
  AND COALESCE(BTRIM("hsCode"), '') <> '';

-- КТ5 — проверка: расхождений не осталось
SELECT COUNT(*) AS diverged FROM "Order"
WHERE "cargoInfo" IS NOT NULL
  AND NULLIF(BTRIM("cargoInfo"->>'hsCode'), '') IS DISTINCT FROM "hsCode";
```

КТ5: ожидается `0` (значение 0 — и после шага 1, и после шага 2; строка с ненулевым числом — скриншот в чат агенту). SQL идемпотентен: повторный прогон ничего не меняет.

## Шаг 6. Smoke по ролям (прод, ≤ 5 минут)

Повторный аудит по ролям на проде — тот же сценарий, что подтвердил фикс в песочнице (скриншоты `download/screenshots/screenshots-v0.7.15/`):

1. `/api/health` — `{"status":"ok"}`.
2. **Менеджер/мастер** (`/admin`): открыть карточку любой заявки из конверсии → «Условия перевозки» показывает **«Место поставки»** (рядом с Инкотермс); «Груз и маршрут» — блок «Маршрут» и вес/объём/места. Править бланк («Править груз и маршрут»), изменить Код ТН ВЭД, сохранить → в «Условиях перевозки» ТН ВЭД стал тем же значением (одна точка правки).
3. **Клиент** (`/client`): в списке заявок строка маршрута заполнена; карточка заявки — блок «Маршрут» (тип, пункты, дата) и вес/объём/места.
4. **Брокер** (`/broker`): в списке заявок строка маршрута заполнена; карточка заявки — «Условия перевозки» с «Место поставки» и ТН ВЭД, «Груз и маршрут» с маршрутом; карточка запроса — то же.

Расхождение — скриншот в чат агенту.

## Шаг 7. Что сообщить владельцу по итогам

В чате: КТ1–КТ5, зелёный CI, Ready-деплой, smoke-чеклист шага 6. Если расхождений ТН ВЭД на проде было много — агент пришлёт число строк, затронутых шагом 5 (можно получить тем же КТ5-запросом ДО выкатки, на старой базе).
