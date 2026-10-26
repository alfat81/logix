# Инструкция владельца: деплой v0.5.5 (фикс e2e-заморозки) — 26.10.2026

Время: ~5–7 минут. Все команды — готовые блоки для вставки в PowerShell (D20).
Выполняйте строго по порядку.

**В этом релизе миграций БД НЕТ и УДАЛЕНИЙ файлов НЕТ** — zip-деплой
переносит его целиком, шаг `git rm` не требуется (в отличие от v0.5.3/v0.5.4).
Контракты API не менялись, поведение прода не менялось (флаг на проде
не задан, лендинг и так без ссылки подрядчика). Релиз чинит шаг заморозки
в CI: лендинг больше не вшивает флаг в статику при сборке.

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

КТ0: `working tree clean`, HEAD = актуальный `main` (на момент подготовки
инструкции — релиз v0.5.4; если после v0.5.4 были другие коммиты —
остановитесь и сверьтесь со мной).

## 1. Распаковать архив с заменой

```powershell
Expand-Archive -Path "C:\PROJECTS\logix-v0.5.5.zip" -DestinationPath "C:\PROJECTS\logix" -Force
```

Путь к zip подставьте фактический. `.env` владельца архив не содержит
и не перезатирает.

## 2. Индексация и сверка

```powershell
git add -A
git status --short
```

КТ1: **7 файлов** — 4 изменённых (`src/app/page.tsx`, `package.json`,
`CHANGELOG.md`, `docs/ROADMAP.md`) и 3 новых
(`docs/releases/RELEASE-NOTES-v0.5.5.md`,
`docs/releases/RELEASE-INSTRUCTIONS-v0.5.5.md`,
`docs/releases/SCOPE-v0.5.5.json`).
Точный состав: **4M + 3A = 7, удалений 0**. Если строк больше/меньше —
остановитесь и пришлите вывод `git status`.

## 3. Коммит и пуш

```powershell
git commit -m "release v0.5.5: fix e2e freeze step — landing reads CONTRACTOR_PORTAL_ENABLED at runtime (force-dynamic)"
git push origin main
git log --oneline -1
```

## 4. Проверка CI (цель релиза — полностью зелёный прогон)

Откройте Actions → ждите зелёного по всем 4 job'ам:

- `validate · tsc · lint · build`;
- `integrity (G3/G4 — IC-01..IC-14, knip)`;
- `e2e API (PostgreSQL)` — 149/149 + шаг заморозки **16/16**;
- `gitleaks`.

КТ2: **все 4 job зелёные — первый полностью зелёный прогон с момента
появления контура проверок (DF-00B)**. Если что-то красное — пришлите
полный лог упавшего job'а.

## 5. Проверка прода

После автодеплоя Vercel:

```powershell
curl.exe -s https://logix-gamma.vercel.app/api/health
```

КТ3: `{"status":"ok","db":"ok",...,"version":"<новый SHA>"}`. На лендинге
ссылки «Вход для подрядчиков» нет (как и было), кабинет подрядчика
закрыт (D31), вход мастера работает.

## Откат

Предыдущий архив `logix-v0.5.4.zip` распаковывается поверх по инструкции
v0.5.4 (включая шаг `git rm src/lib/mock-db.ts` — он уже выполнен в клоне,
повтор не нужен, но сверьте `git status` с КТ2 той инструкции).
Точка невозврата не требуется: миграций нет.
