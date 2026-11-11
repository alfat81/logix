# RELEASE-INSTRUCTIONS v0.10.0 — DF-27 волна 2 (D77)

Применение пакета владельцем. Правила: RULES 2.11 (push — владелец), миграция — протокол А с отдельного разрешения; each step проверяемый, откат — не требуется (additive).

## 0. Предусловия

- Клон синхронизирован от `origin/main` = `b599bf1` (волна 1 + фикс IC-12). Если фикс #84 (D76) уже применён отдельным коммитом — шаги идемпотентны (распаковка с заменой).
- Путь к клону: ниже `C:\path\to\logix` — замените на свой.

## 1. Целостность и распаковка (PowerShell)

```powershell
# 0) после скачивания вернуть расширение
Rename-Item .\logix-v0.10.0.zip_ logix-v0.10.0.zip

# 1) синхронизация клона
git -C C:\path\to\logix fetch origin
git -C C:\path\to\logix rev-parse --short HEAD   # ожидается b599bf1 (или коммит с D76-фиксом)

# 2) целостность архива
Get-FileHash .\logix-v0.10.0.zip -Algorithm SHA256
# ожидается: <SHA256 — см. logix-v0.10.0.sha256 / сообщение поставки>

# 3) распаковка с заменой (.env владельца не затрагивается)
Expand-Archive -Path .\logix-v0.10.0.zip -DestinationPath C:\path\to\logix -Force

# 4) контроль состава (новые файлы волны 2 + docs v1.3 + релизный комплект)
git -C C:\path\to\logix status --short
```

## 2. Быстрые проверки (PowerShell, до пуша)

```powershell
cd C:\path\to\logix
bun install
bunx prisma validate            # схема валидна
bunx tsc --noEmit               # 0 ошибок
bun run lint                    # 0 ошибок (36 предупреждений — базлайн)
python scripts/inventory.py --check   # IC-12 актуален
python scripts/integrity_check.py     # «Итог: OK: новых 0»
python scripts/knip_check.py          # 43 = baseline 43
```

## 3. Миграция `20261112100000_df_27_approval_and_customs` (протокол А, SQL-редактор NEON)

Миграция **additive**: 2 ALTER (LeadApprovalSnapshot, CustomsCalculation) + 4 CREATE TABLE + индексы/FK. Прежний код v0.9.1 новые объекты не читает; backfill не требуется; откат не требуется.

**Шаг 3.1 — статус миграций до применения:**

```sql
SELECT migration_name, finished_at FROM "_prisma_migrations"
WHERE migration_name LIKE '%df_27%' ORDER BY finished_at;
```
Ожидание: только `20261110120049_df_27_option_snapshots`.

**Шаг 3.2 — применение** (после отдельного разрешения владельца; локально или через `bunx prisma migrate deploy` с рабочим DATABASE_URL).

**Шаг 3.3 — контрольные запросы (SQL Editor NEON):**

```sql
-- К1: колонки снимка согласования v2
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name='LeadApprovalSnapshot'
  AND column_name IN ('routeSnapshot','cargoSnapshot','calcSnapshot','customsCalculationId','printRevisionId')
ORDER BY column_name;
-- ожидание: 5 строк (calcSnapshot/customsCalculationId/printRevisionId/routeSnapshot/cargoSnapshot — jsonb/text)

-- К2: колонки Р-5 у таможенного расчёта
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name='CustomsCalculation' AND column_name IN ('quoteOptionId','origin');
-- ожидание: 2 строки (text)

-- К3: новые таблицы волны 2
SELECT table_name FROM information_schema.tables
WHERE table_schema='public'
  AND table_name IN ('LeadPrintRevision','LeadPrintRevisionConfirmation','CustomsFxRecalc','CustomsFinalPayment')
ORDER BY table_name;
-- ожидание: 4 строки

-- К4: уникальности подтверждений редакций и нумерации
SELECT indexname FROM pg_indexes
WHERE tablename IN ('LeadPrintRevision','LeadPrintRevisionConfirmation')
ORDER BY indexname;
-- ожидание: LeadPrintRevision_leadId_seq_key (UNIQUE),
--           LeadPrintRevisionConfirmation_revisionId_partyRole_key (UNIQUE) + индексы

-- К5: статус миграций после применения
SELECT migration_name, finished_at FROM "_prisma_migrations"
WHERE migration_name LIKE '%df_27%' ORDER BY finished_at;
-- ожидание: + 20261112100000_df_27_approval_and_customs
```

## 4. Пуш и контроль CI

```powershell
git -C C:\path\to\logix add -A
git -C C:\path\to\logix commit -m "release v0.10.0: DF-27 волна 2 — needs_data автомат (§6.4/D75), Р-1 редактирование заявки клиентом (флаг актуализации + атомарный сброс согласования), Р-3 печатные редакции с двойным подтверждением и предварительное согласование (снимок согласования v2), Р-5 перенос истории таможенных расчётов и матрица доступа (брокер — история, клиент — актуальный результат), кабинет подрядчика исключён из основного e2e (D31); миграция df_27_approval_and_customs additive; v1.3 — источник требований, D75 синхронизирован, D77; docs-only части: техплан v1.3, роадмапы 1.29"
git -C C:\path\to\logix push origin main
```
Контроль: прогон CI — все 4 job'а зелёные (в т.ч. integrity — первым шагом; e2e 844/844 — счётчик сместился: блок подрядчика удалён).

## 5. Смоук по ролям (после деплоя)

- Клиент: неполный запрос → бейдж «Требует дополнительных данных»; правка анкеты при вариантах → плашка «варианты требуют актуализации»; подтверждение печатной редакции в карточке.
- Менеджер: таб «Требуют данных»; ручная установка needs_data → 409; правка анкеты при согласовании → согласование сброшено автоматически; «Сформировать редакцию» → подтверждение.
- Брокер: история таможенных расчётов на своей сделке; чужая — 404.
- Клиент: блок «Таможенный расчёт» — только актуальный результат, без истории.
- Подрядчик: кабинет по-прежнему 404 (заморозка).
