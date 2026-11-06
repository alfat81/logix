# RELEASE-INSTRUCTIONS v0.8.5 — DF-13 «Пакет документов по заявке» (03.11.2026)

Владелец выполняет в PowerShell из клона `C:\PROJECTS\logix`. База — v0.8.4 (на проде, смоук DF-12 закрыт). В релизе: **миграций НЕТ, env-переменных НЕТ, изменений схемы НЕТ** — шаг 5 протокола А (миграция прода) в этот раз НЕ выполняется. Новая зависимость `fflate` ставится Vercel-ом при сборке автоматически, на вашей машине ничего ставить не нужно. Порядок: синхронизация клона → распаковка → КТ1/КТ2 → sha256 → пуш/CI → Vercel → smoke по ролям.

## Шаг 0. Синхронизация клона (до распаковки!)

```powershell
git fetch origin
git status
```

Если ветка behind `origin/main` и локальных коммитов нет:

```powershell
git reset --hard origin/main
```

Если есть локальные коммиты или незавершённый rebase/merge — чат агенту, самому не мержить. `origin/main` — v0.8.4 (коммит 076de74).

## Шаг 1. Проверка sha256 архива (KT2a)

Архив приходит с суффиксом `_` (защита от платформенного фильтра zip). Рядом лежит `logix-v0.8.5.sha256` — сверка целостности ДО распаковки:

```powershell
Get-FileHash .\logix-v0.8.5.zip_ -Algorithm SHA256 | Format-List
Get-Content .\logix-v0.8.5.sha256
```

Хеш из первой строки вывода обязан совпасть со значением в файле (формат `sha256: …`). Не совпало — стоп, чат агенту (файл побился при передаче, перезалив).

## Шаг 2. Распаковка

```powershell
Rename-Item .\logix-v0.8.5.zip_ logix-v0.8.5.zip
Expand-Archive -Path .\logix-v0.8.5.zip -DestinationPath . -Force
```

**КТ1 — версия:**

```powershell
Select-String -Path .\package.json -Pattern '"version"'
```

Ожидается `"version": "0.8.5"`. Не совпало — стоп, чат агенту.

**КТ2 — состав (перед коммитом):**

```powershell
git status --short
```

Состав «ожидается» (расхождение по НАЛИЧИЮ строк `src/…` — стоп, чат агенту). **Новые файлы** — `src/lib/document-package.ts`, `src/lib/document-package.test.ts`, `src/lib/document-package-server.ts`, `src/components/documents/DocumentsRegistrySection.tsx` (04.11.2026 DF-26 волна 1: DocumentsPackageSection заменён реестром DocumentsRegistrySection), `src/components/documents/parts/DocumentCard.tsx`, `src/components/documents/parts/PackageZipFallbackDialog.tsx`, `src/app/api/admin/orders/[id]/package/route.ts`, `src/app/api/admin/orders/[id]/package/zip/route.ts`, `src/app/api/client/orders/[id]/package/route.ts`, `src/app/api/client/orders/[id]/package/zip/route.ts`, `src/app/api/broker/orders/[id]/package/route.ts`, `src/app/api/broker/orders/[id]/package/zip/route.ts`, `docs/releases/RELEASE-NOTES-v0.8.5.md`, `docs/releases/RELEASE-INSTRUCTIONS-v0.8.5.md`, `docs/releases/SCOPE-v0.8.5.json`; **правки** — `src/lib/document-constants.ts`, `src/components/documents/DocumentsSection.tsx`, `src/components/documents/parts/types.ts`, `src/components/documents/parts/DocumentCreateDialog.tsx`, `src/components/admin/order/OrderSidePanel.tsx`, `src/components/client/ClientOrderCard.tsx`, `src/components/broker/BrokerOrderCard.tsx`, `package.json`, `bun.lock`, `scripts/e2e_api_test.py`, `docs/INVENTORY.md`, `docs/ROADMAP.md`, `docs/ROADMAP-DEALFLOW.md`, `CHANGELOG.md`, `.gitignore` (гигиена: runtime-каталоги песочницы `.storage/` и `.pg/` — мимо git).

## Шаг 3. Коммит и пуш

```powershell
git add -A
git commit -m "release v0.8.5: DF-13 пакет документов по заявке — слоты по видам D5 (статус нет/черновик/на проверке/финальный — худший из документов вида, несколько BL/CMR допустимы), подсказка «кто предоставляет» (дефолты D5/D35 до DF-14), пакетное ядро document-package-server (аудитория: клиент/брокер — 404 на чужую, подрядческие виды не раскрываются), ZIP финальных (fflate store, структура <номер>/<вид>-<название>-v<версия>, транслитерация), порог Vercel 4,5МБ -> константа 4МиБ + JSON-фолбэк ссылками, пустой пакет 400; UI: DocumentsPackageSection x3 кабинета, слоты всегда, «Загрузить» с предвыбранным видом, DocumentCard общий part; vitest 488 (+22), e2e 584 (+26)"
git push origin main
```

GitHub Actions — дождаться **зелёного** CI. Красный — лог в чат агенту; откат `git revert HEAD --no-edit && git push` (только по согласованию).

## Шаг 4. Vercel

Deployments → дождаться **Ready**. Миграций и env-переменных в релизе нет — Redeploy вручную НЕ требуется, шаг 5 протокола А (миграция прода) в этом релизе отсутствует: схема базы не менялась, на проде ничего выполнять не нужно.

## Шаг 5. Smoke на проде (по ролям, RULES 2.16)

1. `/api/health` → `{"status":"ok","db":"ok"}`.
2. Вход ×4 кабинета.
3. **Сотрудник** — карточка заявки → вкладка «Документы»: заголовок «Пакет документов», строки по группам «Расчёт / Оформление и перевозка / Заявки и договоры / Прочее», у каждой строки вид, статус-бейдж («Нет» у пустых) и подсказка «предоставляет: Клиент/Брокер/Сотрудник»; документ из DF-12-смоука (финальный) сидит в своём слоте с бейджем «Финальный» с замком.
4. Кнопка «Загрузить» в слоте «Прочее» → диалог загрузки, вид уже выбран — загрузить тестовый PDF → он появился в своём слоте со статусом «Черновик»; кнопка «Финальный» → бейдж с замком.
5. «Скачать финальные» (шапка) → скачивается ZIP; внутри папка с номером заявки, имена файлов латиницей вида `bill-of-lading-Konosament…-v2.pdf`, финальные документы внутри, черновиков нет.
6. **Клиент** (свой кабинет): «Пакет документов» — слоты без подрядческих видов («Заявки и договоры» содержит только «Заявка клиента»), статус виден, кнопок жизненного цикла нет; «Скачать финальные» → ZIP без внутренних документов.
7. **Брокер**: аналогично — слоты видны, ZIP без внутренних.
8. Тестовый документ удалить (кнопка «Удалить» у сотрудника).

## Откат

Vercel → Deployments → **Promote** предыдущего деплоя (0.8.4), затем `git revert HEAD --no-edit && git push`. База не затрагивалась — откатывать нечего.
