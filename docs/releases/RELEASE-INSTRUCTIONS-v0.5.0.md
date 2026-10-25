# Инструкция владельца: деплой v0.5.0 (25.10.2026)

Время: ~10–12 минут. Все команды — готовые блоки для вставки в
PowerShell (D20). Выполняйте строго по порядку. Если контрольная точка
показала не то, что ожидается, — ОСТАНОВИТЕСЬ и пришлите мне вывод
команды в чат, ничего не коммитите.

**В этом релизе миграций НЕТ** — схема базы и env-переменные не
менялись. Содержание: P1-22 — все 14 монолитов (>300 строк) разрезаны
до ≤294 (диалоги/формы — в предметные каталоги, API — patch/schemas/
helpers, печать — PrintTable), справочники брокеров/сотрудников/
юрлиц — в анатомии §4.2–4.3 (табы, поиск, карточки). Поведение экранов
и API-контракты не менялись.

**Важно:** публикуем релиз только командами git из PowerShell.
Загрузка файлов через сайт GitHub (кнопка «Add file → Upload files»)
для релизов запрещена.

v0.4.1 уже в проде (коммит `131030e`, подтверждён по health), поэтому
инструкция идёт от него. Архив v0.5.0 кумулятивный — содержит всё
предыдущее.

## 0. Привести клон в чистое состояние

Откройте PowerShell и скопируйте блок целиком:

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

Пояснения:

- «No rebase/merge in progress» в ответе — нормально, идите дальше.
- `git reset --hard origin/main` + `git clean -fd` делают клон точной
  копией GitHub. Ваш `.env` не пострадает — он игнорируется git.
- **Контрольная точка 0:** `git log --oneline -1` должна показать
  `131030e release v0.4.1: …` (начало сообщения — «release v0.4.1:
  P1-23 терминология D27…»). `git status` — «working tree clean».
  Другой коммит — пришлите мне вывод всего блока, ничего не делайте
  дальше.

## 1. Распаковать релизный архив в клон

Скачайте `logix-v0.5.0.zip` из чата в папку `C:\PROJECTS\logix`,
затем скопируйте блок целиком:

```powershell
Remove-Item .\logix-v0.4.1.zip -ErrorAction SilentlyContinue
Expand-Archive -Path .\logix-v0.5.0.zip -DestinationPath . -Force
```

Файлы лягут поверх клона с заменой. Ошибка «файл занят/используется» —
закройте редакторы, которые могли открыть файлы проекта, повторите
блок.

## 2. Контрольная точка 1: версия архива

```powershell
Get-Content .\package.json | Select-String '"version"'
git status
```

- **КТ1:** `"version": "0.5.0"`.
- **КТ2:** `git status` — ровно **67 строк** (19 `modified` + 48
  untracked). Untracked — 48, ровно:
  - `docs/releases/RELEASE-NOTES-v0.5.0.md`,
    `docs/releases/RELEASE-INSTRUCTIONS-v0.5.0.md` — 2;
  - `src/app/admin/orders/[id]/print/PrintTable.tsx`,
    `src/app/admin/orders/[id]/print/data.ts` — 2;
  - `src/app/api/admin/leads/[id]/patch.ts` — 1;
  - `src/app/api/admin/leads/[id]/convert/helpers.ts` — 1;
  - `src/app/api/admin/orders/[id]/patch.ts`,
    `src/app/api/admin/orders/[id]/schemas.ts` — 2;
  - `src/components/admin/ListToolbar.tsx` — 1;
  - `src/components/admin/attention/` — 2
    (`AttentionSections.tsx`, `types.ts`);
  - `src/components/admin/broker/` — 5 (`BrokerCard.tsx`,
    `BrokerCreateDialog.tsx`, `BrokerEditDialog.tsx`,
    `BrokerFormFields.tsx`, `types.ts`);
  - `src/components/admin/cargo/` — 2 (`CargoFormFields.tsx`,
    `CargoGroupsView.tsx`);
  - `src/components/admin/contractorlead/` — 7
    (`ContractorLeadActionsDialog.tsx`,
    `ContractorLeadContractDialog.tsx`,
    `ContractorLeadCreateDialog.tsx`, `ContractorLeadStatusBadge.tsx`,
    `RawInfoView.tsx`, `TransportChips.tsx`, `types.ts`);
  - `src/components/admin/contractorpool/` — 3
    (`ContractorPoolEditDialog.tsx`, `ContractorPoolToggleDialog.tsx`,
    `types.ts`);
  - `src/components/admin/employee/` — 7 (`EmployeeCard.tsx`,
    `EmployeeCreateDialog.tsx`, `EmployeeEditDialog.tsx`,
    `EmployeeResetPasswordDialog.tsx`, `RoleChips.tsx`,
    `password.ts`, `types.ts`);
  - `src/components/admin/legalentity/` — 5 (`LegalEntityCard.tsx`,
    `LegalEntityCreateDialog.tsx`, `LegalEntityEditDialog.tsx`,
    `RequisitesFields.tsx`, `types.ts`);
  - `src/components/admin/stagecatalog/` — 3 (`StageCreateDialog.tsx`,
    `StageEditDialog.tsx`, `types.ts`);
  - `src/components/client/ClientLeadCreateDialog.tsx` — 1;
  - `src/components/documents/parts/` — 3
    (`DocumentCreateDialog.tsx`, `DocumentVersionDialog.tsx`,
    `types.ts`);
  - `src/hooks/use-paged-list.ts` — 1.

  Итого untracked: 2 + 2 + 1 + 1 + 2 + 1 + 2 + 5 + 2 + 7 + 3 + 7 + 5 +
  3 + 1 + 3 + 1 = 48.
- Modified — 19 файлов, ровно:
  - корень: `CHANGELOG.md`, `package.json`;
  - `docs/`: `DECISIONS.md`, `ROADMAP.md`;
  - `src/app/admin/orders/[id]/print/page.tsx`;
  - `src/app/api/admin/leads/[id]/route.ts`,
    `src/app/api/admin/leads/[id]/convert/route.ts`;
  - `src/app/api/admin/orders/[id]/route.ts`;
  - `src/components/admin/`: `AttentionScreen.tsx`, `BrokersList.tsx`,
    `CargoGroups.tsx`, `ContractorLeadsSection.tsx`,
    `ContractorPoolSection.tsx`, `EmployeesList.tsx`,
    `LegalEntitiesList.tsx`, `OrderPrintToolbar.tsx`,
    `StageCatalogList.tsx` — 9;
  - `src/components/client/ClientHome.tsx`;
  - `src/components/documents/DocumentsSection.tsx`.

  Итого modified: 2 + 2 + 1 + 2 + 1 + 9 + 1 + 1 = 19.

Лишние/недостающие строки — остановитесь, пришлите вывод.

## 3. Коммит и пуш

```powershell
git add -A
git commit -m "release v0.5.0: P1-22 справочники по §4.3 после резки 14 монолитов: брокеры/сотрудники/юрлица в анатомии §4.2-4.3 (табы ListTabs, карточки §4.3-lite, поиск Ж4 ListToolbar, пагинация usePagedList), диалоги/формы - в предметные каталоги (broker/employee/legalentity/contractorlead/contractorpool/stagecatalog/cargo/attention/parts), API routes - patch/schemas/helpers, печать - PrintTable+data; поведение и API-контракты не менялись (без миграций)"
git push origin main
git log --oneline -1
```

- **КТ3:** на GitHub в свежем коммите — «67 files changed».
  CI пройдёт зелёным (tsc/lint/vitest/build + e2e PostgreSQL +
  gitleaks), как в предыдущих релизах.

## 4. Деплой Vercel

Vercel подхватит пуш сам. Дождитесь статуса **Ready** для коммита
v0.5.0 (домен logix-gamma.vercel.app).

## 5. Контрольная точка 4: health

```powershell
curl.exe -s https://logix-gamma.vercel.app/api/health
```

Ожидание: `{"status":"ok","db":"ok",...,"version":"<НОВЫЙ SHA>"}` —
SHA уже не `131030e`. Пришлите мне ответ — сверю SHA с коммитом.

## 6. Smoke на проде (8 пунктов, 5–7 минут)

1. Сайдбар: разделы **«Брокеры», «Сотрудники», «Юрлица»** открываются;
   счётчики «Запросы/Заявки» на месте (не сломались).
2. `/admin/brokers`: шапка с кнопкой добавления (Coral), табы
   **«Действующие / Деактивированные / Все»** переключаются, карточки
   брокеров в единой сетке.
3. `/admin/employees`: поиск **«Имя или телефон…»** — введите часть
   имени (регистр не важен) и телефон — список фильтруется; кнопка
   сброса (крестик) возвращает полный список.
4. `/admin/legal-entities`: карточка юрлица открывается, диалог
   редактирования показывает реквизиты (закройте без сохранения).
5. `/admin/contractors`: пул подрядчиков и секция заявок подрядчика
   рендерятся как раньше (резка монолита 777).
6. Карточка любой заявки: блок **«Документы»** — список на месте,
   загрузка нового файла работает (если удобнее — только откройте
   диалог и закройте); группы груза в анкете не сломались.
7. Печатная форма заявки (кнопка «Печать»): таблица 26 пунктов на
   месте, кнопка печати работает.
8. Главная: блок «Требует внимания» рендерится; клиентский кабинет —
   если под рукой тестовый клиент: создание запроса открывает диалог
   (резка ClientHome).

Если какой-то пункт ведёт себя иначе, чем раньше, — пришлите скриншот,
релиз откатывать не нужно, разберём точечно.
