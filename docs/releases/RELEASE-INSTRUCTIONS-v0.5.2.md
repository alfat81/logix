# Инструкция владельца: деплой v0.5.2 (DF-00B) — 26.10.2026

Время: ~5–7 минут. Все команды — готовые блоки для вставки в PowerShell (D20).
Выполняйте строго по порядку.

**В этом релизе миграций БД НЕТ** — схема базы не менялась. Поведение приложения
не менялось: релиз добавляет контур проверок качества (D30) и чистит рудименты.
Содержание: DF-00B — инвентаризация (docs/INVENTORY.md), контроль области
изменений (scripts/scope.py), целостность IC-01…IC-14 с храповиком
(scripts/integrity_check.py), knip-храповик, CI-задание integrity, гейт в
build-release.py, DEPRECATIONS/FROZEN, первичная чистка (needsRehash,
adapter-pg, APEX-комментарии, D27-терминология, мёртвые зависимости,
архив релизных файлов), P1-25 закрыта как поглощённая.

## 0. Привести клон в чистое состояние

Откройте PowerShell и выполните блок:

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

Контрольная точка 0: рабочий каталог чист (`working tree clean`), коммит
соответствует актуальному состоянию ветки `main`.

## 1. Распаковать релизный архив в клон

Скачайте `logix-v0.5.2.zip` в папку `C:\PROJECTS\logix`, затем выполните:

```powershell
Expand-Archive -Path .\logix-v0.5.2.zip -DestinationPath . -Force
Remove-Item .\logix-v0.5.2.zip -ErrorAction SilentlyContinue
```

## 2. Проверка статуса файлов

```powershell
git status
```

Ожидается примерно 96 файлов: 27 изменённых (M), 41 добавленных (A),
28 удалённых (D). Удалённые и часть добавленных — это переезд
`docs/releases/RELEASE-*v0.2.*–v0.4.1.md` → `docs/archive/releases/`.
Ключевые файлы:
- изменённые: `package.json` (0.5.2), `CHANGELOG.md`, `README.md`, `DEPLOY.md`,
  `.env.example`, `.gitignore`, `.github/workflows/ci.yml`, `next.config.ts`,
  `bun.lock`, `prisma/schema.prisma`, `scripts/build-release.py`, `scripts/seed.ts`,
  `docs/RULES.md`, `docs/ROADMAP.md`, `docs/ROADMAP-DEALFLOW.md`,
  `src/lib/password.ts`, `src/lib/password.test.ts`, `src/lib/auth.ts`,
  `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`,
  `src/app/admin/orders/[id]/print/print.css`,
  `src/app/api/admin/orders/[id]/stages/[stageId]/route.ts`,
  `src/app/api/auth/employee/login/route.ts`,
  `src/components/admin/CustomerCreateDialog.tsx`,
  `src/components/admin/OrderPrintToolbar.tsx`,
  `src/components/admin/order/OrderQuoteDialog.tsx`
- добавленные: `docs/INVENTORY.md`, `docs/DEPRECATIONS.md`, `docs/FROZEN.md`,
  `knip.json`, `docs/releases/SCOPE-v0.5.2.json`,
  `docs/releases/RELEASE-NOTES-v0.5.2.md`,
  `docs/releases/RELEASE-INSTRUCTIONS-v0.5.2.md`,
  `scripts/inventory.py`, `scripts/scope.py`, `scripts/integrity_check.py`,
  `scripts/integrity-baseline.json`, `scripts/knip_check.py`,
  `scripts/knip-baseline.json`, `scripts/shadow-db.ts`,
  `scripts/test_integrity.py`, `docs/archive/releases/*` (28)
- удалённые: `docs/releases/RELEASE-{NOTES,INSTRUCTIONS}-v0.2.*–v0.4.1.md` (28)

## 3. Локальные тесты и сборка

```powershell
npm test
npm run lint
npm run build
```

Все 3 команды должны завершиться успешно (39 unit-тестов зелёные).
Python-гейты (нужен Python 3.12 в PATH; БД не требуется):

```powershell
python scripts/test_integrity.py
python scripts/knip_check.py
```

Ожидаются: `OK` у обоих (23/23 фикс-кейсов; knip 40/40 baseline).
`python scripts/integrity_check.py` требует локальную PostgreSQL с миграциями
(IC-01) — можно пропустить: в CI задание `integrity` прогонит его на сервисе.

## 4. Коммит и пуш

```powershell
git add .
git commit -m "release v0.5.2: DF-00B контур проверок G1-G4 (inventory, scope, integrity, knip) + чистка рудиментов"
git push origin main
```

## 5. Проверка после деплоя

После завершения автодеплоя на Vercel проверьте:
1. `GET https://<домен>/api/health` — `status: ok, db: ok`.
2. CI на GitHub: задание `integrity` появилось и зелёное (рядом с checks/e2e/gitleaks).
3. Поведение не изменилось: вход сотрудника, список запросов, карточка заявки,
   печать — работают как в v0.5.1; в metadata браузера — «воронка запросов»
   (терминология D27).
