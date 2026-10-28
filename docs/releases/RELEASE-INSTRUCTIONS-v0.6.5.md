# Release Instructions v0.6.5 — DF-03 «Очередь уведомлений и письма трёх режимов» + contract-очистка

Дата: 28.10.2026 · База для КТ0: `cfe687e` (v0.6.4) · Миграции: **ДА** — две (одна additive, одна contract)

## Состав релиза: 57 файлов (34 M + 23 A)

**Модифицируемые (32):**
`package.json` · `.env.example` · `CHANGELOG.md` · `DEPLOY.md` · `docs/ROADMAP.md` · `docs/ROADMAP-DEALFLOW.md` · `docs/DEPRECATIONS.md` · `docs/INVENTORY.md` · `prisma/schema.prisma` · `scripts/e2e_api_test.py` · `scripts/integrity-baseline.json` · `scripts/knip-baseline.json` (снята устаревшая запись ACTIVITY_EXTERNAL_WHERE) · `scripts/build-release.py` (исключение next-env.d.ts — генерируемый файл Next не продукт) · `src/app/admin/(dashboard)/page.tsx` · `src/app/api/admin/brokers/route.ts` · `src/app/api/admin/brokers/[id]/route.ts` · `src/app/api/admin/brokers/[id]/users/route.ts` · `src/app/api/admin/customers/[id]/access/route.ts` · `src/app/api/admin/orders/[id]/notes/route.ts` · `src/app/api/contractor/orders/[id]/stages/[stageId]/route.ts` · `src/components/admin/NoteForm.tsx` · `src/components/admin/broker/types.ts` · `src/components/admin/broker/BrokerCard.tsx` · `src/components/admin/broker/BrokerCreateDialog.tsx` · `src/components/admin/broker/BrokerEditDialog.tsx` · `src/components/admin/broker/BrokerFormFields.tsx` · `src/components/admin/employee/types.ts` · `src/components/admin/employee/EmployeeCard.tsx` · `src/components/admin/employee/EmployeeCreateDialog.tsx` · `src/components/admin/employee/EmployeeEditDialog.tsx` · `src/lib/activity.ts` · `src/lib/audience.ts` · `src/lib/events.ts` · `src/lib/participants.ts` · `src/lib/settings.ts` · `src/lib/employees.ts` · `src/lib/brokers.ts` · `src/lib/events-guard.test.ts` · `src/lib/events.test.ts` · `src/lib/settings.test.ts` · `src/lib/actor-name.test.ts` · `src/lib/audience.test.ts` · `src/lib/company-users.test.ts` · `src/lib/password.test.ts` · `src/lib/participants.test.ts` — 43 пути в 32 группах изменений (полный список — `git status --short` после распаковки; сверка по КТ1).

**Новые (22):**
`prisma/migrations/20261028092831_df_03_notifications/migration.sql` · `prisma/migrations/20261028100000_df_03_contract/migration.sql` · `src/lib/notifications/rules.ts` · `src/lib/notifications/enqueue.ts` · `src/lib/notifications/templates.ts` · `src/lib/notifications/digest.ts` · `src/lib/notifications/dispatch.ts` · `src/lib/notifications/transport.ts` · `src/lib/notifications/channel.ts` · `src/lib/notifications/windows.ts` (математика окон: Intl-таймзоны без зависимостей, допуск 15 мин, zonedWallTimeToUtc) · `src/lib/notifications/notifications.test.ts` · `src/lib/notifications/transports/email.ts` · `src/lib/notifications/transports/fake.ts` · `src/lib/notifications/transports/telegram.ts` · `src/lib/notifications/transports/whatsapp.ts` · `src/lib/event-registry.ts` · `src/lib/brand.ts` · `src/app/api/internal/notifications/dispatch/route.ts` · `src/app/api/admin/notifications/route.ts` · `.github/workflows/scheduler.yml` · `docs/releases/RELEASE-NOTES-v0.6.5.md` · `docs/releases/RELEASE-INSTRUCTIONS-v0.6.5.md` (этот файл) · `docs/releases/SCOPE-v0.6.5.json`

**⚠ Contract-миграция `df_03_contract` необратима** (drop `Activity.isInternal`, `Customer.password`, `Broker.password`): страховка отката (хеши в старых колонках) пережила окно 0.6.4 и удаляется по правилу «замена = удаление». Все пять записей DEPRECATIONS закрываются этим релизом — вход клиентов и брокеров давно через `CustomerUser`/`BrokerUser` (v0.6.2, боевой деплой v0.6.2 прошёл 28.10 утром).

## КТ0 — чистая база (Windows PowerShell)

```powershell
cd C:\PROJECTS\logix
git status                 # clean, HEAD = cfe687e (v0.6.4)
git fetch origin; git log --oneline -1 origin/main   # cfe687e
```

Если рабочее дерево грязное — `git stash list` и разбор ДО распаковки.

## Шаг 1 — распаковка

```powershell
# SHA-256 архива должен совпасть с выданным агентом
Get-FileHash .\logix-v0.6.5.zip -Algorithm SHA256
Expand-Archive -Path .\logix-v0.6.5.zip -DestinationPath . -Force
```

## Шаг 2 — КТ1: состав и версия

```powershell
git status --short
```

**Ожидание: 57 строк** (34 `M` + 23 `A`; список выше). Особое внимание: ДВА миграционных файла — НОВЫЕ (A), `prisma/schema.prisma` — M, каталог `src/lib/notifications/` — 12 новых файлов, `src/lib/activity.ts` и `src/lib/events.ts` — M.

```powershell
git grep '"version"' -- package.json    # "version": "0.6.5"
```

## Шаг 3 — миграции

```powershell
npx prisma@6.19.3 migrate deploy
```

⚠️ **Именно `prisma@6.19.3`** (версия из bun.lock — урок v0.6.4: голый `npx prisma` тянет Prisma 8 RC с переименованными командами).

**Ожидание:** `10 migrations found` (8 было), две applying:
`20261028092831_df_03_notifications` (две новые таблицы — additive), затем
`20261028100000_df_03_contract` (`DROP COLUMN "isInternal" ON "Activity"`, `DROP COLUMN "password" ON "Customer"`, `DROP COLUMN "password" ON "Broker"`),
`All migrations have been applied`.

Безопасность окна: миграция additive (`df_03_notifications`) не трогает существующие таблицы; contract-миграция удаляет ТОЛЬКО изжитые колонки — код v0.6.4 их не читает (вход клиентов/брокеров через `CustomerUser`/`BrokerUser` с деплоя v0.6.2). Окно между миграцией и сменой кода безопасно.

## Шаг 4 — env (в Vercel и локально в .env)

Новые переменные (RULES 2.3 — в том же релизе, документация DEPLOY.md §4.3):

| Переменная | Значение сейчас | Позже (после O-2) |
|---|---|---|
| `EMAIL_PROVIDER` | `fake` — письма «доставляются» в очередь (проверка контура) | `resend` — боевая отправка |
| `CRON_SECRET` | любой длинный случайный (`openssl rand -hex 24`) | тот же в GitHub Secrets |
| `APP_BASE_URL` | боевой адрес приложения | тот же |
| `EMAIL_ALLOWLIST` | не задавать (production и так пропускает всех) | при необходимости |
| `RESEND_API_KEY`, `EMAIL_FROM` | не задавать | ключ из панели Resend, `notify@fatyanov.com` |

## Шаг 5 — коммит и push

```powershell
git add -A
git status --short        # все 54 в стейдже, ничего лишнего
git commit -m "release v0.6.5: DF-03 очередь уведомлений и письма трёх режимов (D33) — Notification (18 колонок, снимок toAddress, dedupKey @unique) + NotificationPreference (миграция df_03_notifications additive); emitEvent ставит письма в очередь в той же транзакции (сбой постановки откатывает операцию); матрица §8 в src/lib/notifications/rules.ts (фаза из immediate_phases, целевой статус этапа: done → клиент, problem → красный ответственному + клиенту нейтрально); окна 09:00/16:00 МСК с допуском 15 мин, лимит в сутки, пустой дайджест не отправляется, группировка по сделкам; диспетчер POST /api/internal/notifications/dispatch (Bearer CRON_SECRET) + workflow scheduler.yml 5 мин + немедленная попытка через after() (троттлинг 15с); транспорты Resend HTTP API через fetch / fake / заглушки Telegram-WhatsApp; allowlist вне production; бренд писем из настроек (brand.ts); журнал GET /api/admin/notifications (мастер); contract 0.6.5 — все пять записей DEPRECATIONS сняты: logActivity удалена (замороженный роут на emitEvent), Activity.isInternal → audience (eventWhereFor без страховки), ACTIVITY_EXTERNAL_WHERE удалён, Customer.password/Broker.password удалены (вход через CustomerUser/BrokerUser с v0.6.2), миграция df_03_contract (drop 3 колонок); реестр событий → event-registry.ts (разрыв цикла); настройки +red_subject_prefix (18); vitest 163/163 (+12), e2e 260/260 (+35 DF-03), tsc/lint/build чисто, integrity OK 0 новых, knip 37≤38, scope OK"
git push origin main
```

## Шаг 6 — CI и планировщик

1. CI 4 job зелёные (`e2e API (PostgreSQL)`, `integrity`, `gitleaks`, `validate · tsc · lint · build`).
2. GitHub → Settings → Secrets → Actions: `CRON_SECRET` (тот же, что в Vercel), `APP_BASE_URL`.
3. Actions → Scheduler → Enable. Проверка: Run workflow вручную → job зелёный (в ответе `{"sent":…}`).
4. Vercel: redeploy уже произойдёт от push; проверить, что env-переменные из Шага 4 заданы.

## Шаг 7 — прод-смоук DF-03 (~10 минут, EMAIL_PROVIDER=fake)

1. **Настройки**: `/admin/settings` → группа «Рассылки» — 8 ключей, новый «Префикс темы красных писем» = «Срочно:»; изменить `client_digest_times` на другое время → 200 → сбросить.
2. **Диспетчер**: `POST https://<адрес>/api/internal/notifications/dispatch` с `Authorization: Bearer <CRON_SECRET>` → 200 `{"sent":0,...}`; без токена → 403.
3. **Согласование**: создать заявку, довести до статуса «Согласование», у клиента (человека с email) письмо уходит сразу → Actions/dispatch уже отработал.
4. **Красное**: поставить этапу «Проблема» → письмо клиенту немедленно, тема начинается с «Срочно:», текст «задержка» (слово «проблема» отсутствует).
5. **Окна**: перевести заявку в «В работе», завершить 2–3 этапа → письма в очереди `pending` (журнал `GET /api/admin/notifications?recipientKind=client`); в окно из настроек — ОДИН дайджест со списком событий, сгруппированный по заявке.
6. **Деактивация**: деактивировать человека у брокера → событие → письмо не создаётся.

## Шаг 8 — боевая отправка (после O-2, отдельная сессия)

1. Зарегистрировать домен в Resend, добавить DNS: SPF, DKIM (2 записи), DMARC `p=none`.
2. Выпустить API-ключ, положить `RESEND_API_KEY` + `EMAIL_FROM=notify@fatyanov.com` в Vercel, `EMAIL_PROVIDER=resend`.
3. Проверочное письмо себе на gmail и на mail.ru/yandex — во «Входящие», не в спам (критерий приёмки DF-03).
