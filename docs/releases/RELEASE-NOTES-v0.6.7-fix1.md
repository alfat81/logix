# RELEASE-NOTES v0.6.7-fix1 — хотфикс: дрейф схема↔миграции RefItem.updatedAt (IC-01)

Дата: 29.10.2026. Основание: CI v0.6.7 красный на integrity — IC-01 FAIL
(1 новая находка); Vercel-деплой зелёный. Формат пакета: патч-архив
`logix-v0.6.7-fix1.zip` (прецедент v0.6.2-fix1 — только изменённые файлы),
`version` в package.json не меняется.

## Симптом

CI: `NEW IC-01 schema-migrations-diff` — «Changed the `RefItem` table:
Altered column `updatedAt` (default changed from `None` to `Some(Now)`)».
Локальный гейт песочницы при этом показывал «integrity OK новых 0».

## Причина (две независимые)

1. Продукт: в DF-17 схема объявляет `RefItem.updatedAt` как
   `@default(now()) @updatedAt`, а миграция `df_17_references` создала
   колонку без `DEFAULT` — пара «схема↔миграция» рассогласована. Все
   остальные пары в базе согласованы (у большинства моделей —
   `DEFAULT CURRENT_TIMESTAMP`; у `Setting` — голый `@updatedAt` и колонка
   без дефолта; `RefItem` была единственным исключением).
2. Гейт: IC-01 молча SKIP'ался в песочнице — regex
   `postgresql://user:pass@host` не принимал URL без пароля
   (`postgresql://logix@127.0.0.1:5432/...` как в `.env` песочницы), а SKIP
   не попадал в сводку прогона. В CI job-env задаёт URL с паролем — там
   проверка выполнялась и поймала дрейф.

## Фикс

- Миграция `df_17fix_refitem_default` (additive, одна команда):
  `ALTER TABLE "RefItem" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;`
  Схема не менялась — выровнена миграцией по конвенции большинства моделей
  (`@default(now()) @updatedAt` ↔ `DEFAULT CURRENT_TIMESTAMP`). На проде
  применяется мгновенно: `SET DEFAULT` не переписывает таблицу.
- `scripts/integrity_check.py`: regex принимает URL без пароля; SKIP
  печатается в сводке с причиной («ВНИМАНИЕ: IC-01 SKIP — …; дрейф
  схема↔миграции НЕ проверялся»); валидация без конфига БД теперь FAIL,
  а не молчаливый SKIP.

## Гейты (песочница, 29.10.2026)

- integrity: IC-01 OK — реальный shadow-diff (postgres 16, logix_ic_shadow),
  Итог OK: новых 0, устаревших baseline 0
- vitest 202/202, tsc --noEmit 0, eslint 0 ошибок (8 старых WARN),
  next build OK (56/56 страниц)
- e2e не перегонялся: продуктовый код (src/) не менялся; авторитетный прогон — CI

## Владельцу (КТ fix1)

1. Распаковать архив поверх репо — 3 файла: миграция (A),
   `scripts/integrity_check.py` (M), NOTES (A)
2. `npx prisma@6.19.3 migrate deploy` — 1 новая миграция, additive
3. commit + push → CI: integrity IC-01 OK (без NEW), e2e 293/293, build
4. Смоук не требуется: изменение на уровне дефолта БД, API/UI не затронуты
