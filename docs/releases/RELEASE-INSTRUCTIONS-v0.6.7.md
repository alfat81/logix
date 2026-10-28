# Release Instructions v0.6.7 — DF-17 «Справочники и курсы»

Дата: 28.10.2026 · База для КТ0: `aeb4bc9` (v0.6.6) · Миграции: **ДА (одна, additive)** · Env продукта: **+2 необязательные переменные**

## Состав релиза: 65 файлов (42 M + 23 A)

**Модифицируемые (42):**
`.env.example` (+`CBR_IMPORT`, `CBR_RATE_URL`) · `.github/workflows/ci.yml` (env job e2e + `CBR_IMPORT: 'off'` — раннер без внешней сети) · `DEPLOY.md` (+2 строки в таблице env) · `CHANGELOG.md` · `docs/INVENTORY.md` (регенерация) · `docs/ROADMAP.md` (статус-блок v0.6.7) · `docs/ROADMAP-DEALFLOW.md` (§6 факт, карточка DF-17 [x]) · `knip.json` · `package.json` (0.6.7) · `prisma/schema.prisma` (+`RefItem`, +`CurrencyRate`, nullable поля-коды `Lead`/`Order`) · `scripts/e2e_api_test.py` (+секция DF-17 ×23) · `scripts/integrity_check.py` (+гард IC-16) · `scripts/integrity-baseline.json` · `scripts/knip-baseline.json` · `scripts/seed.ts` (+`seedReferences` — актуализация без перезаписи правок мастера) · роуты: `api/admin/leads` (route, `[id]/convert`, `[id]/options`, `[id]/patch`), `api/admin/options/[id]`, `api/admin/orders` (route, `[id]/patch`, `[id]/schemas`), `api/client/leads` (route, `[id]`) — приём кодов справочника и денормализация имён · компоненты: `AdminNav`, `LeadCard`, `OrderCreateDialog`, `QuoteOptionFormFields`, `cargo/CargoFormFields`, `cargo/CargoGroupsView`, `lead/LeadConvertBlock`, `lead/types`, `order/OrderQuoteDialog`, `ClientLeadCreateDialog` — Combobox/IncotermPicker в формах · либы: `client-constants`, `lead-edit`, `leads`, `money` (CURRENCIES → запасной список), `notifications/dispatch` (импорт курсов первым шагом), `orders`, `route-fields`

**Новые (23):**
`docs/REFERENCES-SOURCES.md` (источники и условия использования — IC-16) · `docs/releases/RELEASE-NOTES-v0.6.7.md` · `docs/releases/RELEASE-INSTRUCTIONS-v0.6.7.md` (этот файл) · `docs/releases/SCOPE-v0.6.7.json` · `prisma/migrations/20261028120000_df_17_references/migration.sql` (additive) · `scripts/ref-data/countries.ts` · `scripts/ref-data/currencies.ts` · `scripts/ref-data/incoterms.ts` · `scripts/ref-data/packaging.ts` · `src/app/admin/(dashboard)/references/page.tsx` · `src/app/api/admin/references/route.ts` · `src/app/api/admin/references/[id]/route.ts` · `src/app/api/ref/[dir]/route.ts` · `src/components/admin/references/RefDialog.tsx` · `src/components/admin/references/ReferencesScreen.tsx` · `src/components/admin/references/ref-types.ts` · `src/components/references/ReferenceCombobox.tsx` · `src/components/references/IncotermPicker.tsx` · `src/lib/cbr.ts` + `cbr.test.ts` · `src/lib/ref.ts` + `ref.test.ts` · `src/lib/ref-db.ts`

**Удалений нет (0 D).** Полный список — `git status --short` после распаковки (сверка по КТ1).

## КТ0 — чистая база (Windows PowerShell)

```powershell
cd C:\PROJECTS\logix
git status                 # clean, HEAD = aeb4bc9 (v0.6.6)
git fetch origin; git log --oneline -1 origin/main   # aeb4bc9
```

## Шаг 1 — распаковка

```powershell
Get-FileHash .\logix-v0.6.7.zip -Algorithm SHA256    # сверить с выданным агентом
Expand-Archive -Path .\logix-v0.6.7.zip -DestinationPath . -Force
```

## Шаг 2 — КТ1: состав и версия

```powershell
git status --short
```

**Ожидание: 65 строк** (42 `M` + 23 `A`; список выше). Особое внимание: новая миграция ровно одна (`prisma/migrations/20261028120000_df_17_references/`), каталог `src/components/references/` — два общих компонента, `src/components/admin/references/` — экран справочника, `scripts/ref-data/` — четыре файла данных.

```powershell
git grep '"version"' -- package.json    # "version": "0.6.7"
```

## Шаг 3 — миграция (additive)

```powershell
npx prisma@6.19.3 migrate deploy
```

**Ожидание: `11 migrations found`, applying `20261028120000_df_17_references`** — две новые таблицы (`RefItem`, `CurrencyRate`) + nullable поля-коды на `Lead`/`Order`. Миграция additive: данных не трогает, откат — без изменений кода. Клиент в prod на это окно не влияет (обратная совместимость полная).

## Шаг 4 — сид справочников и env

**Сид — обязательно один раз** (справочники заполняются актуализацией, правки мастера не перезаписываются):

```powershell
npx tsx scripts/seed.ts
```

Урок 29.10 (fix2): до fix2 команда `npx prisma@6.19.3 db seed` была **молчаливым no-op** — exit 0 без действий (в package.json не было конфига `prisma.seed`, а сид лежит в `scripts/seed.ts`). После применения fix2 (блок `"prisma": {"seed": "tsx scripts/seed.ts"}` в package.json) равнозначна и `npx prisma@6.19.3 db seed`. Критерий успеха в обоих случаях — строка ожидания ниже, а не exit code.

Если `MASTER_PHONE`/`MASTER_PASSWORD` не заданы в `.env` — передать их прямо в команде: `$env:MASTER_PHONE="+7…"; $env:MASTER_PASSWORD="…"; npx tsx scripts/seed.ts`. Сид идемпотентен: повторный запуск безвреден.

Ожидание в выводе: `Справочники DF-17 актуализированы (country: 249, currency: 32, packaging: 24, incoterm: 12)`.

**Env продукта:** новых обязательных нет. `CBR_IMPORT`/`CBR_RATE_URL` в Vercel НЕ задавать (дефолт `on` — импорт курсов включён). Напоминание с v0.6.5: `EMAIL_PROVIDER=fake` (до O-2), `CRON_SECRET`, `APP_BASE_URL` — на месте.

## Шаг 5 — коммит и push

```powershell
git add -A
git status --short        # все 65 в стейдже, ничего лишнего
git commit -m "release v0.6.7: DF-17 справочники и курсы — платформа RefItem (dir: country|currency|packaging|incoterm, @@unique([dir,code]), код не правится после использования) + CurrencyRate (курсы ЦБ РФ, (date,code) @unique, импорт идемпотентен); сид scripts/ref-data/*: страны ISO 3166-1 ×249 (Intl.DisplayNames + RU_NAME_OVERRIDES), валюты ISO 4217 ×32 (minorUnits, активны RUB/USD/EUR/CNY), упаковка Рек. 21 ЕЭК ООН ×24 (коды из источника — Приказ ФТС № 1003), Инкотермс 2020 ×11 + DAT 2010 неактивен (собственные разъяснения, тексты ICC не копируются, флаги таможенной стоимости draft до утверждения брокером O-12); money.ts CURRENCIES — запасной список, выбор валюты из справочника (IC-16); lib/ref.ts + ref-db.ts (поиск, resolveActiveRefs — активность на момент действия); API GET /api/ref/[dir] (все кабинеты) + /api/admin/references(/[id]) (мастер+менеджер, код → 400); экран /admin/references; ReferenceCombobox (поиск, клавиатура, 375px) + IncotermPicker (разъяснение рядом, draft-пометка, ®); формы: LeadCard/OrderCreateDialog/OrderQuoteDialog/QuoteOptionFormFields/CargoFormFields/CargoGroupsView/LeadConvertBlock/ClientLeadCreateDialog, поля-коды Lead/Order (expand) с денормализацией имён, старые значения открываются; курсы ЦБ: lib/cbr.ts (XML_daily.asp, windows-1251, запятая, номинал) проходом диспетчера DF-03, env +CBR_IMPORT/CBR_RATE_URL, DEPLOY.md; docs/REFERENCES-SOURCES.md — источники и условия использования, integrity +IC-16; миграция df_17_references additive; vitest 202/202 (+26), e2e 293/293 (+23), tsc/lint/build чисто, integrity OK новых 0, knip 37=37, scope OK"
git push origin main
```

## Шаг 6 — CI и деплой

1. Все 4 job зелёные: `e2e API (PostgreSQL)` — ожидание **293/293** (+23 секция DF-17), `integrity` (IC-16 в работе), `gitleaks`, `validate · tsc · lint · build`.
2. Vercel: redeploy от push. После деплоя **выполнить Шаг 4 (сид) ещё раз не нужно** — справочники уже в боевой базе с Шага 4; диспетчер сам подтянет курсы ЦБ на ближайшем проходе (workflow `scheduler.yml`, ≤ 5 минут; в Vercel внешняя сеть есть — `CBR_IMPORT` не задан).

## Шаг 7 — прод-смоук DF-17 (~15 минут)

1. **Справочники**: `/admin/references` под мастером и менеджером — табы «Страны / Валюты / Упаковка / Условия поставки», поиск фильтрует, стран 249.
2. **Валюта**: включить любую (например KZT) → она появляется в формах с выбором валюты; отключить → исчезает для новых строк (существующие сделки не меняются).
3. **Код защищён**: попытка изменить код записи в диалоге — поле недоступно для правки (API отклонил бы с 400).
4. **Заявка**: создать запрос с выбором страны (Китай) и условия поставки FOB — в карточке отображается «Китай» и разъяснение FOB рядом с выбором; старые заявки открываются без изменений.
5. **Курсы ЦБ**: в `CurrencyRate` в базе появилась строка за сегодня (или последняя публикация ЦБ) — `SELECT "date", "code", "value" FROM "CurrencyRate" ORDER BY "date" DESC LIMIT 5;` (импорт шёл проходом диспетчера; пометка источника «курс ЦБ РФ от <дата>» появится в расчётах DF-19).
6. **Клиент**: в форме запроса клиент видит страны и условия поставки (активные), разъяснение термина рядом, DAT отсутствует (неактивен).
