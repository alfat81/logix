# Инструкция владельца: деплой v0.5.4 (фикс CI e2e) — 26.10.2026

Время: ~7–10 минут. Все команды — готовые блоки для вставки в PowerShell (D20).
Выполняйте строго по порядку.

**В этом релизе миграций БД НЕТ.** Контракты API не менялись, поведение
приложения не менялось. Релиз чинит CI-задание «e2e API (PostgreSQL)»
(красное с v0.5.2) и убирает скрытые мок-ветки из `src/lib/db.ts`.

**ВАЖНО — релиз содержит УДАЛЕНИЕ файла.** Zip не переносит удаления
(урок v0.5.2/v0.5.3): после распаковки выполните явный `git rm` из шага 2,
иначе `git status` не совпадёт с КТ3, а в репо останется мёртвый
`mock-db.ts`.

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
инструкции ожидается дерево v0.5.3, коммит `83b4e7e`; если SHA другой —
остановитесь и сверьтесь со мной).

## 1. Распаковать архив с заменой

```powershell
Expand-Archive -Path "C:\PROJECTS\logix-v0.5.4.zip" -DestinationPath "C:\PROJECTS\logix" -Force
```

Путь к zip подставьте фактический. `.env` владельца архив не содержит
и не перезатирает.

## 2. Удалить мок-базу (zip удаления не переносит)

```powershell
git rm src/lib/mock-db.ts
```

КТ1: строка `rm 'mock-db.ts'`.

## 3. Индексация и сверка

```powershell
git add -A
git status --short
```

КТ2: **14 файлов** — 8 изменённых (`.github/workflows/ci.yml`,
`src/lib/db.ts`, `vitest.config.ts`, `scripts/integrity_check.py`,
`scripts/scope_baseline_from_zip.py` — новый, `docs/INVENTORY.md`,
`CHANGELOG.md`, `docs/ROADMAP.md`, `package.json`), 5 новых
(`tests/setup-env.ts`, `docs/releases/RELEASE-NOTES-v0.5.4.md`,
`docs/releases/RELEASE-INSTRUCTIONS-v0.5.4.md`,
`docs/releases/SCOPE-v0.5.4.json`), 1 удалённый (`mock-db.ts`).
Точный состав: **8M + 5A + 1D = 14**. Если строк больше/меньше —
остановитесь и пришлите вывод `git status`.

## 4. Коммит и пуш

```powershell
git commit -m "release v0.5.4: fix CI e2e 401 (remove AI Studio mock-db, fail-fast db.ts, PG service in CI checks)"
git push origin main
git log --oneline -1
```

## 5. Проверка CI (главная цель релиза)

Откройте Actions → ждите зелёного по всем 4 job'ам:

- `validate · tsc · lint · build` — теперь с сервисом postgres:16, миграциями
  и сидом;
- `integrity (G3/G4 — IC-01..IC-14, knip)`;
- **`e2e API (PostgreSQL)` — должен стать зелёным (149/149 + шаг заморозки
  16/16)** — это и есть фикс;
- `gitleaks`.

КТ4: все 4 job зелёные. Если e2e красный снова — пришлите полный лог job'а
(шаги «Миграции», «Сид», «Запуск приложения», «Сквозной API-тест» и
«Лог приложения при падении»).

## 6. Проверка прода

После автодеплоя Vercel:

```powershell
curl.exe -s https://logix-gamma.vercel.app/api/health
```

КТ5: `{"status":"ok","db":"ok",...,"version":"<новый SHA>"}`. Поведение
прода не менялось: кабинет подрядчика закрыт (D31, как в v0.5.3), вход
мастера работает.

## Откат

Предыдущий архив `logix-v0.5.3.zip` распаковывается поверх по той же
инструкции v0.5.3 (шаги 0–4). Точка невозврата не требуется: миграций нет.
