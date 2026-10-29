# RELEASE-NOTES v0.6.7-fix2 — хотфикс: «prisma db seed» был молчаливым no-op

Дата: 29.10.2026. Основание: справочники DF-17 не появились на проде после
выполнения Шага 4 инструкций v0.6.7. Формат: патч-архив (прецедент fix1),
`version` в package.json не меняется.

## Симптом

`npx prisma@6.19.3 db seed` (Шаг 4 инструкций v0.6.7) отрабатывает мгновенно,
exit 0, БЕЗ вывода ожидаемой строки «Справочники DF-17 актуализированы…».
Экран `/admin/references` пуст: страны/валюты/упаковка/Инкотермс отсутствуют.

## Причина

В package.json не было конфига `prisma.seed`, а сид-скрипт лежит в
`scripts/seed.ts`, а не в каталоге prisma/ → `prisma db seed` не находит сид
и **тихо выходит с успехом** (exit 0, ноль действий). Миграция df_17
создала только пустые таблицы — данные кладёт исключительно сид.
Класс отказа тот же, что SKIP IC-01 в fix1: «успешный» шаг, ничего не проверявший.

## Фикс

`package.json`: добавлен блок

```json
"prisma": { "seed": "tsx scripts/seed.ts" }
```

Теперь `prisma db seed` реально запускает сид (и `prisma migrate reset`
подхватит его же). Прочие вызовы (`bun run seed` в CI, `npx tsx scripts/seed.ts`)
не задеты.

## Владельцу (КТ fix2)

1. Распаковать поверх репо — 2 файла: `package.json` (M), NOTES (A)
2. commit + push
3. Сид на проде (если ещё не выполнен вручную):
   `$env:MASTER_PHONE="+7…"; $env:MASTER_PASSWORD="…"; npx prisma@6.19.3 db seed`
   (теперь работает; равнозначно `npx tsx scripts/seed.ts`).
   Ожидание: `Справочники DF-17 актуализированы (country: 249, currency: 32,
   packaging: 24, incoterm: 12)`. Сид идемпотентен: мастер — «уже есть, ок»,
   правки справочников не перезаписываются.
4. Смоук `/admin/references`: страны 249, валюты 32, упаковка 24, Инкотермс 12.

## Вне пакета (конфиг владельца)

Scheduler красный из-за пустых GitHub-секретов `CRON_SECRET`/`APP_BASE_URL`
(curl exit 3 = относительный URL). Задать в GitHub → Settings → Secrets and
variables → Actions: `CRON_SECRET` = значение из Vercel, `APP_BASE_URL` =
`https://<домен-прода>` (без слэша на конце), затем Run workflow → ожидание
`HTTP 200` (401 = расхождение с Vercel env). После позеленения Scheduler
курсы CurrencyRate доедут шедулером за ~5 минут (CBR_IMPORT по умолчанию on).
