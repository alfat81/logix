# Инструкция владельца: деплой v0.5.3 (DF-00C) — 26.10.2026

Время: ~7–10 минут. Все команды — готовые блоки для вставки в PowerShell (D20).
Выполняйте строго по порядку.

**В этом релизе миграций БД НЕТ.** Контракты API не менялись. Поведение:
после деплоя кабинет подрядчика закрыт по умолчанию (404) — это цель релиза
(D31). База подрядчиков, назначение исполнителя на этап и документы работают
как раньше.

**ВАЖНО — этот релиз содержит УДАЛЕНИЯ файлов.** Zip-архив не переносит
удаления: распаковка добавит/обновит файлы, но НЕ уберёт старые. В релизе
v0.5.2 из-за этого в репо остались 28 дублей релизных документов
(`docs/releases/RELEASE-*v0.2.*–v0.4.1*` рядом с их копиями в
`docs/archive/releases/`). В шаге 3 выполняется явный `git rm` — не пропускайте
его, иначе `git status` не совпадёт с КТ3.

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

КТ0: `working tree clean`, HEAD = актуальный `main` (ожидается коммит
`20f34dc` — release v0.5.2).

## 1. Удалить 28 дублей релизных документов (исправление v0.5.2)

```powershell
git rm "docs/releases/RELEASE-NOTES-v0.2.*.md" "docs/releases/RELEASE-INSTRUCTIONS-v0.2.*.md"
git rm "docs/releases/RELEASE-NOTES-v0.3.*.md" "docs/releases/RELEASE-INSTRUCTIONS-v0.3.*.md"
git rm "docs/releases/RELEASE-NOTES-v0.4.0.md" "docs/releases/RELEASE-INSTRUCTIONS-v0.4.0.md"
git rm "docs/releases/RELEASE-NOTES-v0.4.1.md" "docs/releases/RELEASE-INSTRUCTIONS-v0.4.1.md"
git status --short | Measure-Object -Line
```

Если какой-то из шаблонов не нашёл файлы — не страшно: проверьте итог
`Get-ChildItem docs/releases -Filter "RELEASE-*"` — в `docs/releases/` должны
остаться только файлы v0.5.0–v0.5.2 (плюс SCOPE-файлы и README, если есть),
всё старое — в `docs/archive/releases/`.

## 2. Распаковать релизный архив в клон

Скачайте `logix-v0.5.3.zip` в папку `C:\PROJECTS\logix`, затем:

```powershell
Expand-Archive -Path .\logix-v0.5.3.zip -DestinationPath . -Force
Remove-Item .\logix-v0.5.3.zip -ErrorAction SilentlyContinue
```

## 3. Проверка статуса файлов

```powershell
git status
```

Ожидается примерно 26 файлов: 19 изменённых (M), 7 добавленных (A),
28 удалённых (D) из шага 1. Ключевые файлы:
- изменённые: `package.json` (0.5.3), `CHANGELOG.md`, `README.md`, `DEPLOY.md`,
  `.env.example`, `.github/workflows/ci.yml`, `docs/FROZEN.md`,
  `docs/INVENTORY.md`, `docs/ROADMAP.md`, `docs/ROADMAP-DEALFLOW.md`,
  `scripts/scope.py`, `scripts/knip_check.py`, `src/proxy.ts`,
  `src/app/page.tsx`, `src/app/admin/(dashboard)/contractors/page.tsx`,
  `src/components/admin/ContractorPoolSection.tsx`,
  `src/components/admin/ContractorLeadsSection.tsx`,
  `src/components/admin/contractorpool/ContractorPoolEditDialog.tsx`,
  `src/components/admin/contractorlead/ContractorLeadContractDialog.tsx`
- добавленные: `src/lib/flags.ts`,
  `src/app/admin/(dashboard)/contractors/ContractorsClient.tsx`,
  `scripts/e2e_contractor_frozen.py`, `scripts/df00c_browser.sh`,
  `docs/releases/SCOPE-v0.5.3.json`, `docs/releases/RELEASE-NOTES-v0.5.3.md`,
  `docs/releases/RELEASE-INSTRUCTIONS-v0.5.3.md`

KT2 — точный дифф: 19 M + 7 A (список выше) − 28 D (шаг 1) = 54 операции.
Если `git status` показывает файлы вне этого списка — остановитесь и сверьтесь.

## 4. Локальная проверка и сборка

```powershell
bun install
bunx tsc --noEmit
bun run lint
bun run test
bun run build
```

Ожидается: tsc 0, eslint 0, vitest 39/39, build OK.

## 5. Коммит и пуш

```powershell
git add -A
git status --short | Measure-Object -Line
git commit -m "release v0.5.3: DF-00C заморозка кабинета подрядчика (D31): флаг CONTRACTOR_PORTAL_ENABLED, 404 в proxy.ts, UI без выдачи доступа, FROZEN.md, e2e двух режимов, пин bun в CI + git rm 28 дублей релизных документов (фикс v0.5.2)"
git push origin main
```

КТ3: GitHub покажет коммит с ~54 files changed (19 M + 7 A + 28 D).

## 6. Дождаться CI и проверить переменные Vercel

CI (4 job: checks, integrity, e2e, secrets) должен стать зелёным. В e2e-job
появятся новые шаги: «Сквозной тест заморозки D31» и «Проверки заморозки» —
оба зелёные. В логе e2e первой строкой — «Версии тулчейна» (bun 1.4.4, node,
python).

Vercel: переменную `CONTRACTOR_PORTAL_ENABLED` задавать НЕ нужно
(по умолчанию кабинет закрыт). Если она когда-то была задана как `true` —
уберите её в Vercel → Settings → Environment Variables и сделайте
Redeploy, иначе кабинет останется открытым.

## 7. Smoke на проде (~2 минуты)

1. `curl https://logix-gamma.vercel.app/api/health` → `{"status":"ok","db":"ok",...,"version":"<новый SHA>"}`.
2. Откройте `https://logix-gamma.vercel.app/` — ссылки «Вход для подрядчиков»
   НЕТ, «Вход для брокеров/клиентов/сотрудников» на месте.
3. `https://logix-gamma.vercel.app/contractor/login` → 404.
4. Войдите сотрудником: `/admin` → «Подрядчики» → страница и обе секции
   открываются; в диалоге кандидата «Перевести в пул» поля «Стартовый пароль»
   нет, описание упоминает D31.
5. Заявки: назначение исполнителя на этап работает как раньше.

КТ4: деплой считается принятым, когда п.1–4 выполняются.
