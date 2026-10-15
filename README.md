# Logix

Платформа мультимодальной логистики — заявки, подрядчики, брокеры,
документооборот. Стек: Next.js, Prisma, PostgreSQL (Neon), Tailwind,
shadcn/ui, деплой на Vercel.

**Статус:** ранняя разработка. Карта развития — `LOGISTICS-ROADMAP.md`,
очередь задач — `LOGISTICS-TASK-QUEUE.md`.

**Пройдено:** Дорожка А (А1–А6) — каркас, БД, авторизация сотрудников
(телефон+пароль, scrypt, сессии в куках, `requireEmployee(req, {roles,
write})`), деплой-конфиг. Дорожка Б (Б1–Б6) — ядро заявки: схема
(LegalEntity/Customer/Contract/Order/OrderStageCatalog/
OrderStageInstance), каталог этапов с обязательным ядром, API заявок
и этапов, составная нумерация «договор-порядковый» (например «17-1»),
кабинет `/admin` со списком заявок и карточкой этапов. Дорожка В
(В1–В4) — клиентская воронка: схема Lead/QuoteOption (клиент на этапе
запроса опционален, анкета в rawContact Json), API лидов со статусами
`new | calculated | won | lost`; «won» вручную не ставится — только
конвертацией. API вариантов расчёта (В3): выбор ровно одного на лид,
первый вариант переводит лид в `calculated`. Конвертация (В4):
`POST /api/admin/leads/[id]/convert` — требует выбранного варианта,
клиент из `customerId` или find-or-create из `rawContact` (телефон
нормализуется при рождении клиента), юрлицо — обязательный выбор,
заявка через `createOrderWithStages` с договором и обязательными
этапами, лид — `won` (терминальный), повторная — 409.

## Быстрый старт

```bash
bun install
cp .env.example .env          # заполнить DATABASE_URL (Neon Postgres)
bun run db:push
bun run seed                  # мастер-учётка + каталог этапов + юрлицо-образец
bun run dev
```

Вход сотрудников: `/admin/login`. Данные мастера после сида:
телефон `+79000000000`, пароль `logix-master` (для прода задать
`MASTER_PHONE`/`MASTER_PASSWORD` в окружении до запуска сида —
см. `scripts/seed.ts`).

## Основные экраны и API

| Что | Где |
|---|---|
| Лендинг | `/` |
| Вход сотрудников | `/admin/login` |
| Список заявок + фильтр по статусу | `/admin` |
| Карточка заявки: этапы, статусы, даты | `/admin/orders/[id]` |
| Авторизация | `POST /api/auth/employee/login`, `POST /api/auth/employee/logout`, `GET /api/auth/employee/me` |
| Заявки | `GET/POST /api/admin/orders`, `GET/PATCH /api/admin/orders/[id]` |
| Этапы | `POST /api/admin/orders/[id]/stages`, `PATCH/DELETE /api/admin/orders/[id]/stages/[stageId]` |
| Справочники | `/api/admin/customers`, `/api/admin/contracts`, `/api/admin/legal-entities`, `/api/admin/stage-catalog` |
| Лиды (воронка) | `GET/POST /api/admin/leads`, `GET/PATCH/DELETE /api/admin/leads/[id]` |
| Варианты расчёта | `POST /api/admin/leads/[id]/options`, `PATCH/DELETE /api/admin/options/[id]` |
| Конвертация лида в заявку | `POST /api/admin/leads/[id]/convert` |

Правила ядра (раздел 3 роадмапа): обязательные этапы подставляются в
заявку автоматически и не удаляются ни в UI, ни на сервере
(`DELETE` этапа проверяет `OrderStageCatalog.isMandatory`); необязательные
менеджер добавляет из каталога, их порядок — на его усмотрение.

## Имя проекта

`logix` — плейсхолдер. При выборе реального названия заменить в
`package.json` (`name`), здесь и в заголовке `LOGISTICS-ROADMAP.md`/
`LOGISTICS-TASK-QUEUE.md`.
