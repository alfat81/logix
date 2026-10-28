# RELEASE-NOTES v0.6.7-fix3 — хотфикс: Scheduler падал «exit code 3» без диагностики

Дата: 29.10.2026. Основание: красный workflow `Scheduler` в GitHub Actions
(каждые 5 минут). Формат: патч-архив (прецедент fix1/fix2), `version` в
package.json не меняется. Код приложения не задет — только workflow и docs.

## Симптом

Job «Диспетчер уведомлений» (`.github/workflows/scheduler.yml`) красный:
`Error: Process completed with exit code 3`. В логе шага curl-команда видна с
**пустым** Bearer (`Authorization: Bearer `) и **относительным** URL
(`/api/internal/notifications/dispatch` — без хоста). Строки «HTTP …: {…}» в
логе нет — шаг обрывается раньше.

## Причина (две, наложились)

1. **Конфиг владельца (основная):** в GitHub-репозитории не заданы секреты
   `CRON_SECRET` и `APP_BASE_URL`. Интерполяция `${{ secrets.X }}` при
   отсутствии секрета даёт пустую строку → Bearer пустой, URL относительный.
2. **Хрупкость шага (код):** curl при относительном URL завершается кодом 3
   («URL malformed»), а GitHub Actions исполняет `run:` через `bash -e` — шаг
   умирает прямо на присваивании `code=$(curl …)`, до строк диагностики.
   Никакой подсказки, какой секрет виноват, лог не даёт.

## Фикс

`.github/workflows/scheduler.yml`:

- секреты передаются через `env:` (GitHub маскирует значения в логах);
- гарды **до curl**: пустой `APP_BASE_URL` / `CRON_SECRET` или URL без схемы —
  `::error::` с точной инструкцией (куда какой секрет, откуда значение);
- `|| code=000` на curl: сетевой сбой не обрывает шаг до итоговой диагностики;
  сообщение расшифровывает 401/403 (расхождение CRON_SECRET с Vercel), 000
  (эндпоинт не отвечает) и 5xx (логи Vercel).

`docs/releases/RELEASE-INSTRUCTIONS-v0.6.7.md` (и панельная копия): Шаг 4 —
`npx prisma db seed` заменён на `npx tsx scripts/seed.ts` + урок fix2 про
молчаливый no-op (зеркалит fix2).

## Владельцу — конфиг (БЕЗ него Scheduler не позеленеет)

GitHub → Settings → Secrets and variables → Actions → New repository secret:

1. `CRON_SECRET` — **то же значение, что в Vercel** (Bearer-токен диспетчера).
2. `APP_BASE_URL` — боевой адрес приложения, без слэша в конце
   (например, `https://logix.vercel.app`); тот же, что в Vercel.

Проверка: Actions → Scheduler → Run workflow → ожидание в логе `HTTP 200:
{"sent":…}`. 401/403 — значение CRON_SECRET расходится с Vercel; после
позеленения курсы `CurrencyRate` доедут шедулером за ~5 минут
(`CBR_IMPORT` по умолчанию on).

## Применение пакета (КТ fix3)

1. Распаковать поверх репо — 3 файла:
   `.github/workflows/scheduler.yml` (M),
   `docs/releases/RELEASE-INSTRUCTIONS-v0.6.7.md` (M),
   `docs/releases/RELEASE-NOTES-v0.6.7-fix3.md` (A).
2. commit + push.
3. Задать два секрета (см. выше) — это и есть снятие красного.
4. Actions → Scheduler → Run workflow → `HTTP 200`.

Откат: вернуть прежний `scheduler.yml` из git (`git checkout .github/workflows/scheduler.yml`).
Гарды на зелёном окружении поведения не меняют: тот же curl, тот же критерий
`HTTP 200`.
