# RELEASE-INSTRUCTIONS v0.7.6 — DF-08: Ежедневная сводка владельцу

Владелец выполняет в PowerShell из клона `C:\PROJECTS\logix`. База — v0.7.5. **Миграций нет, новых env нет, новых зависимостей нет** — распаковка, контрольные точки, коммит, пуш. Сводка уходит ходом существующего диспетчера (workflow scheduler.yml, каждые 5 минут) — настраивать cron не нужно.

## Шаг 0. Синхронизация клона (до распаковки!)

```powershell
git fetch origin
git status
```

Если ветка behind `origin/main` и локальных коммитов нет:

```powershell
git reset --hard origin/main
```

Если есть локальные коммиты или незавершённый rebase/merge — чат агенту, самому не мержить.

## Шаг 1. Распаковка архива

```powershell
Expand-Archive -Path .\logix-v0.7.6.zip -DestinationPath . -Force
```

**КТ1 — версия:**

```powershell
Select-String -Path .\package.json -Pattern '"version"'
```

Ожидается `"version": "0.7.6"`. Не совпало — стоп, чат агенту.

**КТ2 — состав (перед коммитом):**

```powershell
git status --short
```

Ожидается 19 файлов. Изменённые (`M`, 12):

```
CHANGELOG.md
docs/INVENTORY.md
docs/ROADMAP-DEALFLOW.md
docs/ROADMAP.md
package.json
scripts/e2e_api_test.py
scripts/run-e2e-fix1.sh
src/app/api/admin/pulse/route.ts
src/components/admin/WaitingBadge.tsx
src/lib/events-guard.test.ts
src/lib/notifications/dispatch.ts
src/lib/waiting.ts
```

Новые (`??`/`A`, 7):

```
docs/releases/RELEASE-INSTRUCTIONS-v0.7.6.md
docs/releases/RELEASE-NOTES-v0.7.6.md
docs/releases/SCOPE-v0.7.6.json
scripts/scope_rebaseline.py
src/lib/notifications/owner-digest.test.ts
src/lib/notifications/owner-digest.ts
src/lib/pulse-db.ts
```

Примечание: `scripts/run-e2e-fix1.sh` — утилита прогона e2e (переопределение DATABASE_URL песочницы, дефолт — сервис CI; продукт не затрагивает); `scripts/scope_rebaseline.py` — восстановление baseline scope-гейта из HEAD (конвейер). Расхождение по числу/составу — стоп, чат агенту.

## Шаг 2. Коммит и пуш

```powershell
# Одинарные кавычки PowerShell: внутри НЕ должно быть двойных и
# типографских (« » „ “ ") — урок v0.7.4.
git add -A
git commit -m 'release v0.7.6: DF-08 — ежедневная сводка владельцу: письмо мастеру раз в сутки (цифры Пульса, топ-5 тормозящих, неотправленные письма, ссылка на Пульс), окно 09:00-10:00 МСК из настроек, дедуп за сутки'
git log --oneline -2
git push origin main
```

`git log --oneline -2` обязан показать верхним `release v0.7.6: …` — коммит создался. Не показал — стоп, чат агенту.

## Шаг 3. CI

Дождаться зелёного GitHub Actions (checks + integrity + e2e + заморозка). Красный — прислать лог агенту; откат `git revert HEAD --no-edit && git push`.

## Шаг 4. Vercel

Deployments → Ready (env не менялись — redeploy не требуется).

## Шаг 5. Smoke (прод)

1. `/api/health` — `{"status":"ok","db":"ok"}`.
2. Письмо сводки приходит в окно 09:00–10:00 МСК (диспетчер ходит каждые 5 минут; в пустой день в письме «Существенных изменений нет»).
3. Цифры письма совпадают с Пульсом: ссылка «Открыть Пульс» из письма ведёт на `/admin/pulse`, числа блока 1 те же.
4. «Тормозят»: заявки из письма — самые старые плашки «Ждёт: …» в списках; возраст («2 дн.») совпадает.
5. Настройки → группа «Сводка владельцу»: окно 09:00–10:00; сменить на другой час — сводка уходит в новом окне без выката.
6. Журнал отправок (`/admin/notifications`) — письмо сводки со статусом sent, получатель — мастер.
