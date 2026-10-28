# Release Instructions v0.6.6 — DF-04 «Журнал отправок и повтор для мастера»

Дата: 28.10.2026 · База для КТ0: `595f7a2` (v0.6.5) · Миграции: **НЕТ** · Env продукта: **без изменений**

## Состав релиза: 25 файлов (14 M + 11 A)

**Модифицируемые (14):**
`.github/workflows/ci.yml` (env job e2e + `EMAIL_PROVIDER=fake`, `APP_BASE_URL`, `CRON_SECRET` — уроки красных пробежек 28.10) · `CHANGELOG.md` · `docs/INVENTORY.md` · `docs/ROADMAP.md` · `docs/ROADMAP-DEALFLOW.md` · `package.json` (0.6.6) · `scripts/e2e_api_test.py` (+секция DF-04) · `scripts/knip-baseline.json` (+e2e-фикстура вне TS-графа) · `src/app/api/admin/attention/route.ts` (+`notificationsFailed` мастер-only) · `src/app/api/admin/notifications/route.ts` (+counts) · `src/components/admin/AdminNav.tsx` (+пункт «Журнал отправок») · `src/components/admin/AttentionScreen.tsx` (+секция писем) · `src/components/admin/attention/AttentionSections.tsx` (+`NotificationsFailedSection`) · `src/components/admin/attention/types.ts`

**Новые (11):**
`docs/releases/RELEASE-NOTES-v0.6.6.md` · `docs/releases/RELEASE-INSTRUCTIONS-v0.6.6.md` (этот файл) · `docs/releases/SCOPE-v0.6.6.json` · `scripts/e2e_seed_notification.ts` (фикстура «сломанного транспорта», bun+prisma) · `src/app/admin/(dashboard)/notifications/page.tsx` (мастер-only обёртка) · `src/app/api/admin/notifications/[id]/retry/route.ts` · `src/components/admin/NotificationsJournal.tsx` · `src/lib/notifications/mask.ts` + `mask.test.ts` · `src/lib/notifications/retry.ts` + `retry.test.ts`

**Схема БД: без изменений. Env продукта: без изменений.** Полный список — `git status --short` после распаковки (сверка по КТ1).

## КТ0 — чистая база (Windows PowerShell)

```powershell
cd C:\PROJECTS\logix
git status                 # clean, HEAD = 595f7a2 (v0.6.5)
git fetch origin; git log --oneline -1 origin/main   # 595f7a2
```

## Шаг 1 — распаковка

```powershell
Get-FileHash .\logix-v0.6.6.zip -Algorithm SHA256    # сверить с выданным агентом
Expand-Archive -Path .\logix-v0.6.6.zip -DestinationPath . -Force
```

## Шаг 2 — КТ1: состав и версия

```powershell
git status --short
```

**Ожидание: 25 строк** (14 `M` + 11 `A`; список выше). Особое внимание: миграционных файлов в диффе НЕТ, `prisma/schema.prisma` НЕ изменён, каталог `src/lib/notifications/` получил только `mask*` и `retry*`.

```powershell
git grep '"version"' -- package.json    # "version": "0.6.6"
```

## Шаг 3 — миграции

**Миграций нет** — `prisma migrate deploy` запускать не нужно (схема не менялась).
Если хочется убедиться: `npx prisma@6.19.3 migrate deploy` → `10 migrations found`, ни одной applying.

## Шаг 4 — env

Продукт-переменные не менялись. Проверить разом (оставалось с v0.6.5, Шаг 4 инструкции 0.6.5):
- Vercel: `EMAIL_PROVIDER=fake` (до O-2), `CRON_SECRET`, `APP_BASE_URL` — без первого прод-смоук увидит письма в `skipped`;
- GitHub Secrets: `CRON_SECRET`, `APP_BASE_URL` (для scheduler.yml).

## Шаг 5 — коммит и push

```powershell
git add -A
git status --short        # все 25 в стейдже, ничего лишнего
git commit -m "release v0.6.6: DF-04 журнал отправок и повтор для мастера — экран /admin/notifications (только мастер, паттерн settings): табы статусов ListTabs с counts из API (распределение найденного — таб не сужает сам себя), фильтр по получателю, ошибки доставки и попытки, тела маскируются RULES 2.4 (maskPII: +7 *** ***-**-67, iv***@mail.ru), полный текст по клику; POST /api/admin/notifications/[id]/retry — мастер write:true, failed/skipped → pending (чистый attempts, nextAttemptAt null, строка сразу в claimBatch) + scheduleDispatch, pending/sent → 409 (дубль недопустим), 404; семантика в lib/notifications/retry.ts (интеграционные ×5), no-event: цель строка очереди, не сделка; GET журнала +counts (groupBy по статусам без фильтра статуса); «Требует внимания» +notificationsFailed (только мастеру, не-мастеру null) и секция «Письма не ушли» (AttentionSections), счётчик в общем тотале; AdminNav +«Журнал отправок» (masterOnly); e2e-фикстура e2e_seed_notification.ts (bun+prisma, искусственно сломанный транспорт — критерий приёмки: fake-транспорт не падает, failed через API не создать), секция DF-04 ×10 (журнал/внимание/retry 200/409/404/доставка/чистота); ci.yml: EMAIL_PROVIDER=fake + APP_BASE_URL в env job e2e (уроки красных пробежек 28.10 — CRON_SECRET дал 250/260, дефолт none дал 253/260; env e2e 1-в-1 с песочницей); миграций нет, env продукта не менялся; vitest 176/176 (+13 retry/mask), e2e 270/270 (+10 DF-04), tsc/lint/build чисто, integrity OK новых 0 (no-event-маркер), knip 38=38 (+фикстура вне TS-графа), scope OK"
git push origin main
```

## Шаг 6 — CI

1. Все 4 job зелёные: `e2e API (PostgreSQL)` — ожидание **270/270** (фикс env e2e едет этим же релизом), `integrity`, `gitleaks`, `validate · tsc · lint · build`.
2. Vercel: redeploy от push, env из Шага 4 на месте.

## Шаг 7 — прод-смоук DF-04 (~10 минут, EMAIL_PROVIDER=fake)

1. **Меню**: под мастером в кабинете появился пункт «Журнал отправок»; под менеджером — нет (прямая ссылка `/admin/notifications` → заглушка «Раздел доступен только мастеру»).
2. **Журнал**: `/admin/notifications` — табы с числами, письма от смоука DF-03 (согласование/красное/дайджест) в статусе «Отправлено»; фильтр получателя переключает список.
3. **Маскирование**: в теле письма адреса и телефоны показаны маскированными («iv***@…», «+7 *** …-67»); кнопка «Показать полностью» раскрывает текст.
4. **Повтор**: переключиться на таб «Ошибки» — пусто («Ошибок доставки нет»); если завести ошибку искусственно (например временно `EMAIL_PROVIDER=resend` без ключа, прогнать диспетчер, вернуть `fake`) — письмо видно с текстом ошибки и кнопкой «Повторить»; после повтора — статус «Ждёт», затем «Отправлено».
5. **Внимание**: `/admin` под мастером — при наличии failed-писем секция «Письма не ушли» с числом и ссылкой в журнал; после разбора счётчик гаснет. Под менеджером секции нет.
6. **Защита от дублей**: повторить отправленное нельзя (кнопки нет; API на прямом вызове — 409).

## Шаг 8 — боевая отправка (после O-2, без изменений от 0.6.5)

Resend: домен + DNS (SPF, DKIM×2, DMARC `p=none`) → `RESEND_API_KEY`, `EMAIL_FROM=notify@fatyanov.com`, `EMAIL_PROVIDER=resend` → тест на gmail и mail.ru/yandex. С этого момента журнал показывает providerId Resend, ошибки API видны мастеру в строке письма.
