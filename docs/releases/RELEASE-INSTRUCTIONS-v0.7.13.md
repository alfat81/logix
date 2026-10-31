# RELEASE-INSTRUCTIONS v0.7.13 — DF-09 «Двухфакторный вход для мастера»

Владелец выполняет в PowerShell из клона `C:\PROJECTS\logix`. База — v0.7.12. В релизе: **одна миграция** (`20261030214826_df_09_totp`, additive), **одна новая env** (`TOTP_ENCRYPTION_KEY`), новых зависимостей нет. До включения TOTP конкретным сотрудником вход в системе не меняется.

## Шаг 0. Синхронизация клона (до распаковки!)

```powershell
git fetch origin
git status
```

Если ветка behind `origin/main` и локальных коммитов нет:

```powershell
git reset --hard origin/main
```

Если есть локальные коммиты или незавершённый rebase/merge — чат агенту, самому не мержить. `origin/main` на момент выпуска v0.7.13 — зелёный (v0.7.12).

## Шаг 1. Распаковка архива

```powershell
Expand-Archive -Path .\logix-v0.7.13.zip -DestinationPath . -Force
```

**КТ1 — версия:**

```powershell
Select-String -Path .\package.json -Pattern '"version"'
```

Ожидается `"version": "0.7.13"`. Не совпало — стоп, чат агенту.

## Шаг 2. Переменная окружения TOTP_ENCRYPTION_KEY (Vercel, до пуша — деплой подхватит сам)

Ключ шифрует TOTP-секреты (AES-256-GCM) и подписывает challenge второго шага. Сгенерировать (в PowerShell):

```powershell
$b = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); [Convert]::ToBase64String($b)
```

Скопировать значение (строка ~44 символа). Затем в Vercel: **Settings → Environment Variables** → добавить `TOTP_ENCRYPTION_KEY` со сгенерированным значением для **Production, Preview, Development** → Save.

Так же (опционально, для локальных `db:*`-команд) добавить строку `TOTP_ENCRYPTION_KEY="<значение>"` в свой локальный `.env` — файл в клоне агент не трогает.

Не делиться значением в чате и нигде не публиковать (секрет → env, D32/RULES 2.4). Смена ключа в будущем сделает существующие TOTP непроверяемыми — только при компрометации.

## Шаг 3. Миграция прод-базы

`.env` в клоне должен смотреть на ПРОД-базу (Neon, direct-строка) — как при всех прошлых обновлениях. Проверка и применение:

```powershell
bunx prisma migrate status
```

Ожидается в списке `20261030214826_df_09_totp` со статусом pending. Затем:

```powershell
bun run db:deploy
bunx prisma migrate status   # контроль
```

Ожидание: применение одной миграции `20261030214826_df_09_totp` (3 колонки `Employee` + таблица `TotpRecoveryCode`) и финальное «Database schema is up to date!». Ошибка — стоп, чат агенту. Миграция additive: предыдущая версия кода работает с ней без изменений (expand, RULES 2.3).

## Шаг 4. Коммит и пуш

**КТ2 — состав (перед коммитом):**

```powershell
git status --short
```

Ожидается **17 изменённых** (`M`) и **16 новых** (`??`, включая каталог скриншотов; сам zip в git не попадает — `*.zip` в .gitignore).

Изменённые (`M`):

```
.github/workflows/ci.yml
.env.example
CHANGELOG.md
DEPLOY.md
docs/INVENTORY.md
docs/ROADMAP-DEALFLOW.md
docs/ROADMAP.md
package.json
prisma/schema.prisma
scripts/e2e_api_test.py
scripts/integrity_check.py
scripts/run-e2e-fix1.sh
src/app/admin/(dashboard)/layout.tsx
src/app/admin/login/page.tsx
src/app/api/auth/employee/login/route.ts
src/lib/activity.ts
src/lib/event-registry.ts
```

Новые (`??`; внутри каталогов — по 1–3 файла):

```
docs/releases/RELEASE-INSTRUCTIONS-v0.7.13.md
docs/releases/RELEASE-NOTES-v0.7.13.md
docs/releases/SCOPE-v0.7.13.json
download/screenshots-v0.7.13/
prisma/migrations/20261030214826_df_09_totp/
src/app/admin/(dashboard)/profile/
src/app/api/admin/profile/
src/app/api/auth/employee/login/totp/
src/components/admin/profile/
src/lib/qr.ts
src/lib/totp-crypto.ts
src/lib/totp-db.test.ts
src/lib/totp-db.ts
src/lib/totp.test.ts
src/lib/totp.ts
```

Примечания к составу: `scripts/integrity_check.py` — дополнение гейта IC-03 (делегирование событий `enableTotp(`/`disableTotp(` по прецеденту `setSetting`); `scripts/run-e2e-fix1.sh` — env e2e-раннера; `ci.yml` — env раннера `TOTP_ENCRYPTION_KEY` (одноразовое, не прод); `layout.tsx` — только ссылки «Профиль». Прод-логика входа для сотрудников БЕЗ TOTP не менялась; кабинет подрядчика (`src/**/contractor/**`, `src/proxy.ts`) НЕ в списке. Расхождение по числу/составу — стоп, чат агенту.

```powershell
# Одинарные кавычки PowerShell: внутри НЕ должно быть двойных и
# типографских (кавычки-ёлочки и пр.) — урок v0.7.4.
git add -A
git commit -m 'release v0.7.13: DF-09 двухфакторный вход — TOTP (RFC 6238) на node:crypto без зависимостей, секрет AES-256-GCM (AAD=id) с ключом env TOTP_ENCRYPTION_KEY, QR otpauth:// чистым энкодером (верифицирован декодером), второй шаг после пароля с лимитами login-guard на обоих шагах, коды восстановления хешами одноразово, профиль /admin/profile с выходом на всех устройствах; миграция df_09_totp additive, события totp_enabled/disabled; vitest 431, e2e 493'
git log --oneline -2
git push origin main
```

`git log --oneline -2` обязан показать верхним `release v0.7.13: …`. Не показал — стоп, чат агенту.

## Шаг 5. CI

Дождаться зелёного GitHub Actions (checks + integrity + e2e + заморозка + gitleaks). Красный — прислать лог агенту; откат `git revert HEAD --no-edit && git push`.

## Шаг 6. Vercel

Deployments → Ready. Env добавлялись ДО пуша (Шаг 2) — деплой от пуша подхватит ключ сам. Если по какой-то причине env добавлен ПОСЛЕ завершения деплоя: Settings → Environment Variables уже заполнены → **Deployments → ⋯ → Redeploy** (без rebuild переменная не подхватится).

## Шаг 7. Smoke (прод, ≤ 5 минут)

1. **Обычный вход не изменился**: `/admin/login` → вход по телефону/паролю — попадаете в кабинет, второй шаг НЕ спрашивается (TOTP ещё не включён).
2. **Профиль**: в сайдбаре внизу клик по своему имени (или иконка в шапке телефона) → `/admin/profile` — карточка «Двухфакторный вход» со статусом «выключен» и кнопкой «Включить»; карточка «Сеансы» с «Выйти на всех устройствах».
3. **Опционально — включить TOTP себе** (рекомендуется мастеру): «Включить» → отсканировать QR приложением-аутентификатором (Google Authenticator / Яндекс.Ключ) или ввести секрет вручную → ввести код из приложения → сохранить 10 кодов восстановления в надёжное место. Выйти → войти: после пароля появится поле кода — ввод кода из приложения открывает кабинет.
4. **Если включали TOTP**: «Использовать код восстановления» на втором шаге принимает один из сохранённых кодов; повтор того же кода — «Неверный код подтверждения».
5. **«Выйти на всех устройствах»** в профиле: все сессии завершены, выполняется вход заново.

Расхождение любого пункта — скриншот в чат агенту. Пункты 3–5 по желанию: TOTP включается по решению владельца, система работает и без него.
