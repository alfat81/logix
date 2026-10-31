# RELEASE-INSTRUCTIONS v0.7.14 — Фикс «красного» CI: gitleaks (31.10.2026)

Владелец выполняет в PowerShell из клона `C:\PROJECTS\logix`. База — v0.7.13 (уже на проде, деплой зелёный). В релизе: **нет миграций, нет новых env, нет новых зависимостей** — одна правка конфига CI (`.gitleaks.toml`) + документы. Прод-код не менялся.

## Шаг 0. Синхронизация клона (до распаковки!)

```powershell
git fetch origin
git status
```

Если ветка behind `origin/main` и локальных коммитов нет:

```powershell
git reset --hard origin/main
```

Если есть локальные коммиты или незавершённый rebase/merge — чат агенту, самому не мержить. `origin/main` — v0.7.13 (коммит `7e3a7d0`); красный там только job gitleaks (2 ложных срабатывания), checks/e2e/деплой — зелёные.

## Шаг 1. Распаковка архива

Архив из выдачи приходит с суффиксом `_` — сначала переименовать (если файл уже называется `logix-v0.7.14.zip` — пропустите Rename-Item):

```powershell
Rename-Item .\logix-v0.7.14.zip_ logix-v0.7.14.zip
Expand-Archive -Path .\logix-v0.7.14.zip -DestinationPath . -Force
```

**КТ1 — версия:**

```powershell
Select-String -Path .\package.json -Pattern '"version"'
```

Ожидается `"version": "0.7.14"`. Не совпало — стоп, чат агенту.

## Шаг 2. Коммит и пуш

**КТ2 — состав (перед коммитом):**

```powershell
git status --short
```

Ожидается **4 изменённых** (`M`) и **3 новых** (`??`):

```
M  .gitleaks.toml
M  CHANGELOG.md
M  docs/ROADMAP.md
M  package.json
?? docs/releases/RELEASE-INSTRUCTIONS-v0.7.14.md
?? docs/releases/RELEASE-NOTES-v0.7.14.md
?? docs/releases/SCOPE-v0.7.14.json
```

Расхождение по числу/составу — стоп, чат агенту.

```powershell
# Одинарные кавычки PowerShell: внутри НЕ должно быть двойных и
# типографских (кавычки-ёлочки и пр.) — урок v0.7.4.
git add -A
git commit -m 'release v0.7.14: фикс красного CI — gitleaks generic-api-key на литералах DF-09 дал два ложных срабатывания (одноразовый fallback-ключ unit-теста totp-db.test.ts, статические соли scrypt totp-crypto.ts — KDF-параметры публичны по дизайну, ключ только в env): allowlist .gitleaks.toml тремя точными regex-литералами с обоснованием, пути файлов не алловлистятся; код продукта не менялся, деплой 0.7.13 зелёный; gitleaks полный скан истории 0 утечек; vitest 431, e2e 493'
git log --oneline -2
git push origin main
```

`git log --oneline -2` обязан показать верхним `release v0.7.14: …`. Не показал — стоп, чат агенту.

## Шаг 3. CI

Дождаться зелёного GitHub Actions — теперь включая job gitleaks (checks + integrity + e2e + заморозка + gitleaks). Красный — прислать лог агенту; откат `git revert HEAD --no-edit && git push`.

## Шаг 4. Vercel

Deployments → Ready (деплой рутинный — код продукта не менялся). Новых env нет, Redeploy не требуется.

## Шаг 5. Smoke (прод, ≤ 2 минут)

Код не менялся — короткий контроль, что деплой поднялся:

1. `/api/health` — `{"status":"ok"}`.
2. Вход в `/admin` по телефону/паролю — кабинет открывается.
3. `/admin/profile` — карточки «Двухфакторный вход» и «Сеансы» на месте (как после 0.7.13).

Расхождение — скриншот в чат агенту.
