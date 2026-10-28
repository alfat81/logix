# Release Instructions v0.6.4 — DF-02 «Участники сделки»

Дата: 28.10.2026 · База для КТ0: `f933ef1` (v0.6.3) · Миграция: **ДА** (additive)

## Состав релиза: 30 файлов (24 M + 6 A)

**Модифицируемые (24):**
`package.json` · `CHANGELOG.md` · `docs/ROADMAP.md` · `docs/ROADMAP-DEALFLOW.md` · `docs/DEPRECATIONS.md` · `docs/INVENTORY.md` · `prisma/schema.prisma` · `scripts/build-release.py` (урок v0.6.4: внутренние файлы песочницы не должны попадать в архив — исключения tool-results/, worklog.md в корне, локальные утилиты) · `scripts/e2e_api_test.py` · `src/lib/employees.ts` · `src/lib/brokers.ts` · `src/app/api/admin/employees/route.ts` · `src/app/api/admin/employees/[id]/route.ts` · `src/app/api/admin/brokers/route.ts` · `src/app/api/admin/brokers/[id]/route.ts` · `src/components/admin/employee/types.ts` · `src/components/admin/employee/EmployeeCreateDialog.tsx` · `src/components/admin/employee/EmployeeEditDialog.tsx` · `src/components/admin/employee/EmployeeCard.tsx` · `src/components/admin/broker/types.ts` · `src/components/admin/broker/BrokerFormFields.tsx` · `src/components/admin/broker/BrokerCreateDialog.tsx` · `src/components/admin/broker/BrokerEditDialog.tsx` · `src/components/admin/broker/BrokerCard.tsx`

**Новые (6):**
`prisma/migrations/20261028080900_df_02_contact_email/migration.sql` · `src/lib/participants.ts` · `src/lib/participants.test.ts` · `docs/releases/RELEASE-NOTES-v0.6.4.md` · `docs/releases/RELEASE-INSTRUCTIONS-v0.6.4.md` (этот файл) · `docs/releases/SCOPE-v0.6.4.json`

Новых переменных окружения нет. Удалений файлов нет — шаг `git rm` не требуется.

## КТ0 — чистая база (Windows PowerShell)

```powershell
cd C:\PROJECTS\logix
git status                 # clean, HEAD = f933ef1 (v0.6.3)
git fetch origin; git log --oneline -1 origin/main   # f933ef1
```

Если рабочее дерево грязное — `git stash list` и разбор ДО распаковки.

## Шаг 1 — распаковка

```powershell
# SHA-256 архива должен совпасть с выданным агентом
Get-FileHash .\logix-v0.6.4.zip -Algorithm SHA256
Expand-Archive -Path .\logix-v0.6.4.zip -DestinationPath . -Force
```

## Шаг 2 — КТ1: состав и версия

```powershell
git status --short
```

**Ожидание: ровно 30 строк = 24 `M` + 6 `A`** (список выше; next-env.d.ts в .gitignore — в списке не появится). Особое внимание: миграционный файл `20261028080900_df_02_contact_email/migration.sql` — НОВЫЙ (A), `schema.prisma` — M.

```powershell
git grep '"version"' -- package.json    # "version": "0.6.4"
```

## Шаг 3 — миграция (additive, безопасно для работающего прода)

```powershell
npx prisma migrate deploy
```

**Ожидание:** `7 migrations found` (6 было), `Applying migration 20261028080900_df_02_contact_email`, `All migrations have been applied`. Обе колонки nullable: **старый код v0.6.3 работает с новой схемой без изменений** — окно между миграцией и деплоем безопасно.

## Шаг 4 — коммит и push

```powershell
git add package.json CHANGELOG.md docs/ROADMAP.md docs/ROADMAP-DEALFLOW.md docs/DEPRECATIONS.md docs/INVENTORY.md prisma/schema.prisma prisma/migrations/20261028080900_df_02_contact_email scripts/build-release.py scripts/e2e_api_test.py src/lib/employees.ts src/lib/brokers.ts src/lib/participants.ts src/lib/participants.test.ts src/app/api/admin/employees/route.ts "src/app/api/admin/employees/[id]/route.ts" src/app/api/admin/brokers/route.ts "src/app/api/admin/brokers/[id]/route.ts" src/components/admin/employee/types.ts src/components/admin/employee/EmployeeCreateDialog.tsx src/components/admin/employee/EmployeeEditDialog.tsx src/components/admin/employee/EmployeeCard.tsx src/components/admin/broker/types.ts src/components/admin/broker/BrokerFormFields.tsx src/components/admin/broker/BrokerCreateDialog.tsx src/components/admin/broker/BrokerEditDialog.tsx src/components/admin/broker/BrokerCard.tsx docs/releases/RELEASE-NOTES-v0.6.4.md docs/releases/RELEASE-INSTRUCTIONS-v0.6.4.md docs/releases/SCOPE-v0.6.4.json
git status --short        # все 30 в стейдже, ничего лишнего
git commit -m "release v0.6.4: DF-02 участники сделки — src/lib/participants.ts единая точка «кто в сделке»: participantsOf(orderId|leadId) → {staff, client, brokers, contractors} (staff = активный ответственный, иначе активные мастера; подрядчики этапов справочно — не адресаты, D31; только isActive; неактивная компания — реквизиты без адресатов), recipientsOfCustomer = активные пользователи с email (адресат-человек DF-02A) с фолбэком на Customer.email — единственная точка изменения после пересмотра P1-07; миграция df_02_contact_email: nullable Employee.email/Broker.email (expand), email в формах создания/правки сотрудника и брокера (isEmail, null = очистить), в карточках и API-ответах; vitest 151/151 (+13 participants), e2e 225/225 (+9 DF-02), заморозка D31 16/16, tsc/lint/build чисто, integrity OK новых 0, knip 38=38, scope OK; DEPRECATIONS: contract-записи 0.6.4→0.6.5 (0.6.4 занят релизом); миграция additive — откат без изменений кода"
git push origin main
```

## Шаг 5 — CI

4 job зелёные: `validate` (tsc/lint/build), `gitleaks`, `integrity`, `e2e API (PostgreSQL)` — **225/225** + шаг заморозки **16/16**.

## Шаг 6 — прод

После автодеплоя Vercel:

```powershell
curl.exe -s https://logix-gamma.vercel.app/api/health
```

КТ: `{"status":"ok","db":"ok",...}`.

Smoke «Email для уведомлений» (5 минут, под мастером):

1. **Сотрудник с email.** Справочник сотрудников → «Новый сотрудник»: появилось поле «Email для уведомлений» — создайте сотрудника с адресом → email виден на карточке.
2. **Правка и очистка.** «Править» сотрудника: смените email → сохраняется; очистите поле → сохранится без email (строка на карточке исчезла).
3. **Мусор не сохраняется.** Введите `не-адрес` → тост «Некорректный email…», сохранение отклонено.
4. **Брокер.** Справочник исполнителей → «Добавить брокера»: то же поле → email сохраняется, виден на карточке; в правке очистка работает так же.
5. **Прежнее работает.** Входы сотрудников/клиентов/брокеров не изменились; у существующих сотрудников и брокеров email пуст — это норма (поле необязательное).

## Откат

Миграция additive (две nullable колонки): **старый код v0.6.3 работает с ней без изменений**. Откат деплоя — `git revert` коммита релиза и push; колонки в БД останутся (безвредно, contract-релиз их не удаляет).

## После релиза

- Смоук этого файла → релиз DF-02 закрыт; очередь §6 — следующая задача **DF-03 «Очередь уведомлений + email трёх режимов»** (зависимости DF-00D, DF-01, DF-02 — все закрыты).
