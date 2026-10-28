# Инструкция владельца: деплой v0.6.2 (DF-02A «Сотрудники клиентов и брокеров») — 28.10.2026

Время: ~15 минут. Все команды — готовые блоки для вставки в
PowerShell (D20). Выполняйте строго по порядку.

**Что в этом релизе:** у компании клиента и у брокера — несколько
личных входов (список людей вместо одного пароля); автор действий и
документов — человек (сотрудник видит «Имя (Компания)», другая
сторона — только компанию); UX входа не изменился — существующие
клиенты и брокеры входят по прежним телефон/пароль. **Есть миграция** —
additive: две новые таблицы + nullable колонки сессий, backfill
создаёт основных пользователей из текущих логинов/паролей (хеш
переносится без изменения) и привязывает живые сессии. **Удалений
файлов нет** — шаг `git rm` не требуется. **Новых переменных
окружения нет** — шаг env vars не требуется.

## 0. Привести клон в чистое состояние

```powershell
cd C:\PROJECTS\logix
git rebase --abort
git merge --abort
git fetch origin
git reset --hard origin/main
git clean -fd
git log --oneline -1
git status
```

КТ0: `working tree clean`, HEAD = актуальный `main` (на момент
подготовки — релиз v0.6.1; если после него были другие коммиты —
остановитесь и сверьтесь со мной).

## 1. Распаковать архив с заменой

```powershell
Expand-Archive -Path "C:\PROJECTS\logix-v0.6.2.zip" -DestinationPath "C:\PROJECTS\logix" -Force
```

Путь к zip подставьте фактический. `.env` владельца архив не содержит
и не перезатирает.

## 2. Индексация и сверка

```powershell
git add -A
git status --short
```

КТ1: **50 файлов — 39 изменённых (M) и 11 новых (A), удалений 0**.

Изменённые (39): `CHANGELOG.md`, `package.json`,
`docs/DEPRECATIONS.md`, `docs/INVENTORY.md`, `docs/ROADMAP.md`,
`docs/ROADMAP-DEALFLOW.md`, `prisma/schema.prisma`,
`scripts/e2e_api_test.py`, `scripts/integrity-baseline.json`,
`scripts/integrity_check.py`, `scripts/knip-baseline.json`,
`src/app/admin/(dashboard)/page.tsx`,
`src/app/api/admin/brokers/[id]/route.ts`,
`src/app/api/admin/brokers/route.ts`,
`src/app/api/admin/customers/[id]/access/route.ts`,
`src/app/api/admin/customers/[id]/route.ts`,
`src/app/api/admin/leads/[id]/convert/helpers.ts`,
`src/app/api/admin/leads/[id]/documents/route.ts`,
`src/app/api/admin/leads/[id]/route.ts`,
`src/app/api/admin/orders/[id]/documents/route.ts`,
`src/app/api/admin/orders/[id]/route.ts`,
`src/app/api/auth/broker/login/route.ts`,
`src/app/api/auth/client/login/route.ts`,
`src/app/api/broker/documents/[id]/versions/route.ts`,
`src/app/api/broker/leads/[id]/documents/route.ts`,
`src/app/api/broker/leads/[id]/estimate/route.ts`,
`src/app/api/broker/orders/[id]/documents/route.ts`,
`src/app/api/client/documents/[id]/versions/route.ts`,
`src/app/api/client/leads/[id]/documents/route.ts`,
`src/app/api/client/orders/[id]/documents/route.ts`,
`src/components/admin/BrokersList.tsx`,
`src/components/admin/CustomerCabinetAccess.tsx`,
`src/components/admin/CustomerCard.tsx`,
`src/components/admin/broker/BrokerCard.tsx`,
`src/lib/activity.ts`, `src/lib/broker-auth.ts`,
`src/lib/client-auth.ts`, `src/lib/client-constants.ts`,
`src/lib/documents.ts`.

Новые (11): `docs/releases/RELEASE-NOTES-v0.6.2.md`,
`docs/releases/SCOPE-v0.6.2.json`,
`prisma/migrations/20261028042706_df_02a_company_users/migration.sql`,
`src/app/api/admin/brokers/[id]/users/route.ts`,
`src/components/admin/BrokerUsersDialog.tsx`,
`src/components/admin/CustomerUserDialog.tsx`,
`src/components/admin/broker/BrokerUserForm.tsx`,
`src/lib/actor-name.test.ts`, `src/lib/actor-name.ts`,
`src/lib/company-users.test.ts`, `src/lib/company-users.ts`.

Обязательное наличие `prisma/migrations/20261028042706_…` и `src/lib/company-users.ts`.
Если строк больше/меньше — **остановитесь** и пришлите вывод `git status`.

## 3. Миграция прод-базы (Neon)

Клон уже подключён к прод-базе через `.env` (переменная `DATABASE_URL`).
Миграция: создаёт таблицы `CustomerUser`/`BrokerUser`, добавляет
nullable `userId` в сессии, затем **backfill** — для каждой компании с
выданным доступом и каждого брокера создаёт основного пользователя из
текущих логина/пароля (хеш переносится как есть — вход по прежним
данным продолжит работать) и привязывает живые сессии к основным
пользователям. Существующие данные не трогаются, старые поля
(`Customer.password` и др.) остаются зеркалами отката.

Контрольная точка перед миграцией (урок v0.2.6: deploy только ПОСЛЕ
распаковки архива):

```powershell
Select-String -Path .\package.json -Pattern '"version"'
```

КТ1а: `"version": "0.6.2"`. Не совпало — стоп, чат агенту.

```powershell
npx prisma@6 migrate deploy
```

- Версия `@6` обязательна (проект на Prisma 6; без неё скачается
  Prisma 8 RC с переименованной командой). На вопрос npx «Need to
  install…» — нажмите `y`.
- **Ожидается:** `1 migration found` и `Applying migration
  20261028042706_df_02a_company_users`, в конце «Your database is now
  in sync with your schema». Повторный запуск отвечает «No pending
  migrations» — нормально (идемпотентна). Любая ошибка — стоп, копия
  вывода мне в чат.

Проверка отсутствия дрейфа схемы:

```powershell
npx prisma@6 migrate diff --from-url "$env:DATABASE_URL" --to-schema-datamodel prisma/schema.prisma
```

КТ2: **вывод пустой**. Если не пустой — стоп, вывод мне в чат.

## 4. Коммит и пуш

```powershell
git commit -m "release v0.6.2: DF-02A сотрудники клиентов и брокеров — модели CustomerUser/BrokerUser + миграция df_02a_company_users (backfill основных пользователей, хеш без изменений, nullable userId сессий), вход через authenticateCustomerLogin/authenticateBrokerLogin (guard телефон+IP сохранён), Current* +userId/userName, автор-человек: actorId/authorId = id пользователя + проекция actor-name.ts (staff «Имя (Компания)», коллеги — имя, другая сторона — компания), access-роут = CRUD списка людей, brokers/[id]/users, CustomerUserDialog/BrokerUsersDialog/BrokerUserForm, hasCabinetAccess = активный пользователь с паролем; vitest 138/138, e2e 216/216 (+44 DF-02A), заморозка 16/16"
git push origin main
git log --oneline -1
```

## 5. Проверка CI

Откройте Actions → ждите зелёного по всем 4 job'ам:

- `validate · tsc · lint · build`;
- `integrity (G3/G4 — IC-01..IC-15, knip)`;
- `e2e API (PostgreSQL)` — **216/216** + шаг заморозки 16/16;
- `gitleaks`.

КТ3: все 4 job зелёные. Если что-то красное — пришлите полный лог
упавшего job'а (миграция локальной БД в CI применяется автоматически,
отдельных действий не требует).

## 6. Проверка прода

После автодеплоя Vercel:

```powershell
curl.exe -s https://logix-gamma.vercel.app/api/health
```

КТ4: `{"status":"ok","db":"ok",...}`.

Smoke «Сотрудники компании» (5 минут, под менеджером или мастером):

1. **Список людей.** Карточка клиента с выданным доступом → блок
   «Доступ в кабинет» теперь список людей: один пользователь с бейджем
   «Основной», имя = название компании (миграция не знала личность —
   впишите настоящее имя человека кнопкой правки), телефон = телефон
   компании.
2. **Вход по прежним данным** (критерий приёмки): войдите в кабинет
   клиента тем же телефоном и паролем, что были до релиза, — вход
   работает, пароль не менялся.
3. **Второй человек.** В списке людей добавьте сотрудника компании
   (имя, телефон, пароль от 8 символов) → появился в списке без бейджа
   «Основной». Войдите им в кабинет клиента — видны те же заявки и
   запросы компании.
4. **Деактивация.** Нажмите деактивацию у второго человека → его
   сессия гаснет, повторный вход отвечает «Доступ в кабинет закрыт.
   Обратитесь к менеджеру». Основной пользователь деактивации не
   подлежит (доступ компании целиком закрывается деактивацией
   компании в справочнике).
5. **Автор — человек.** Из кабинета клиента загрузите документ → в
   админке в карточке заявки (раздел «Документы») автор версии — имя
   человека; в журнале заявки действие клиента подписано «Имя
   (Компания)».
6. **Брокеры.** Справочник исполнителей → карточка брокера → кнопка
   «Сотрудники»: основной пользователь создан автоматически (имя =
   название компании), можно добавлять людей. Новый брокер создаётся
   сразу с основным пользователем.

## Откат

Миграция additive (новые таблицы + nullable колонки): **старый код
v0.6.1 работает с ней без изменений** — вход идёт по зеркалу
`Customer.password`/`Broker.password`, которое релиз поддерживает
(выдача/смена пароля основного пишется в оба места). При проблемах
откатываем только код:

```powershell
Expand-Archive -Path "C:\PROJECTS\logix-v0.6.1.zip" -DestinationPath "C:\PROJECTS\logix" -Force
git add -A
git commit -m "rollback to v0.6.1"
git push origin main
```

Миграцию и данные НЕ трогаем. Созданные до отката пользователи
останутся в таблицах (безвредно — старый код их не читает), вход по
прежним данным продолжит работать через зеркала. Особенность: люди,
добавленные ПОСЛЕ релиза как не-основные (зеркала у них нет по
дизайну), после отката входить не смогут — перезаведите доступ
кнопкой выдачи в v0.6.1. При возврате на v0.6.2 и далее всё
подхватится снова.
