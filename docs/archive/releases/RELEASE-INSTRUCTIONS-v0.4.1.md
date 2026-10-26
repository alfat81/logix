# Инструкция владельца: деплой v0.4.1 (25.10.2026)

Время: ~10 минут. Все команды — готовые блоки для вставки в PowerShell
(D20). Выполняйте строго по порядку. Если контрольная точка показала
не то, что ожидается, — ОСТАНОВИТЕСЬ и пришлите мне вывод команды в чат,
ничего не коммитите.

**В этом релизе миграций НЕТ** — меняются только пользовательские
тексты: «Лиды/Лид» → «Запросы/Запрос» во всём кабинете сотрудника
(D27): навигация, заголовки, диалоги, тосты, ошибки API, журнал,
главная, глобальный поиск, карточки клиента и заявки. Код, роуты и
схема базы не трогаются, новых env-переменных нет.

**Важно:** публикуем релиз только командами git из PowerShell.
Загрузка файлов через сайт GitHub (кнопка «Add file → Upload files»)
для релизов запрещена.

v0.4.0 уже в проде (коммит `a91652e`, подтверждён по health), поэтому
инструкция идёт от него. Архив v0.4.1 кумулятивный — содержит всё
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
  `a91652e release v0.4.0: …` (начало сообщения — «release v0.4.0:
  P1-21 лиды и прочие карточки…»). `git status` — «working tree clean».
  Другой коммит — пришлите мне вывод всего блока, ничего не делайте
  дальше.

## 1. Распаковать релизный архив в клон

Скачайте `logix-v0.4.1.zip` из чата в папку `C:\PROJECTS\logix`,
затем скопируйте блок целиком:

```powershell
Remove-Item .\logix-v0.4.0.zip -ErrorAction SilentlyContinue
Expand-Archive -Path .\logix-v0.4.1.zip -DestinationPath . -Force
```

Файлы лягут поверх клона с заменой. Ошибка «файл занят/используется» —
закройте редакторы, которые могли открыть файлы проекта, повторите блок.

## 2. Контрольная точка 1: версия архива

```powershell
Get-Content .\package.json | Select-String '"version"'
git status
```

- **КТ1:** `"version": "0.4.1"`.
- **КТ2:** `git status` — ровно **39 строк** (37 `modified` + 2
  untracked). Untracked — только:
  `docs/releases/RELEASE-NOTES-v0.4.1.md` и
  `docs/releases/RELEASE-INSTRUCTIONS-v0.4.1.md`.
- Modified — 37 файлов, ровно:
  - корень: `CHANGELOG.md`, `DEPLOY.md`, `package.json`;
  - `docs/`: `BRANDBOOK.md`, `DECISIONS.md`, `ROADMAP.md`, `RULES.md`;
  - `scripts/`: `e2e_api_test.py`;
  - `src/app/admin/(dashboard)/`: `layout.tsx`,
    `orders/[id]/page.tsx` — 2 файла;
  - `src/app/api/` — 10 файлов: `admin/leads/route.ts`,
    `admin/leads/[id]/route.ts`, `admin/leads/[id]/brokers/route.ts`,
    `admin/leads/[id]/brokers/[brokerId]/route.ts`,
    `admin/leads/[id]/convert/route.ts`,
    `admin/leads/[id]/documents/route.ts`,
    `admin/leads/[id]/notes/route.ts`,
    `admin/leads/[id]/options/route.ts`,
    `admin/options/[id]/route.ts`,
    `broker/leads/[id]/documents/route.ts`;
  - `src/components/` + `src/lib/` — 17 файлов: `AdminNav.tsx`,
    `AttentionScreen.tsx`, `BrokerLinksSection.tsx`,
    `CustomerCard.tsx`, `CustomersList.tsx`, `GlobalSearch.tsx`,
    `LeadCard.tsx`, `LeadCreateDialog.tsx`, `LeadEditDialog.tsx`,
    `LeadsList.tsx`, `QuoteOptionsSection.tsx`, `SideActivityFeed.tsx`,
    `lead/LeadConvertBlock.tsx`, `lead/LeadStatusControls.tsx`,
    `order/OrderCargoCard.tsx`, `lib/leads.ts`,
    `lib/status-machine.test.ts`.

Итого: 8 + 2 + 10 + 17 = 37. Лишние/недостающие строки — остановитесь,
пришлите вывод.

## 3. Коммит и пуш

```powershell
git add -A
git commit -m "release v0.4.1: P1-23 терминология D27 - Запросы вместо Лидов во всех кабинетах: только пользовательские тексты (навигация/диалоги/тосты/журнал/поиск/карточки), код Lead и роуты /api/admin/leads сохранены (без миграций)"
git push origin main
git log --oneline -1
```

- **КТ3:** на GitHub в свежем коммите — «39 files changed».
  CI пройдёт зелёным (tsc/lint/vitest/build + e2e PostgreSQL +
  gitleaks), как в предыдущих релизах.

## 4. Деплой Vercel

Vercel подхватит пуш сам. Дождитесь статуса **Ready** для коммита
v0.4.1 (домен logix-gamma.vercel.app).

## 5. Контрольная точка 4: health

```powershell
curl.exe -s https://logix-gamma.vercel.app/api/health
```

Ожидание: `{"status":"ok","db":"ok",...,"version":"<НОВЫЙ SHA>"}` —
SHA уже не `a91652e`. Пришлите мне ответ — сверю SHA с коммитом.

## 6. Smoke на проде (8 пунктов, 5 минут)

1. Сайдбар: раздел называется **«Запросы»** (не «Лиды»), таблетка со
   счётчиком на месте.
2. `/admin/leads`: заголовок **«Запросы»**, табы «Все / Новые /
   Рассчитанные / Выигранные / Отказ» с числами.
3. Кнопка **«Новый запрос»** открывает диалог с заголовком «Новый
   запрос» и кнопкой «Создать запрос» (закройте без создания).
4. Карточка любого запроса: шапка **«Запрос от {дата}»**, крошки
   «Главная > Запросы > …».
5. Карточка клиента: блок **«Запросы: N»**.
6. Карточка заявки из запроса: **«Конвертирована из запроса от …»** /
   «Запрос-источник».
7. Главная: блок **«Запросы без движения»**.
8. Глобальный поиск (лупа): секция **«Запросы»**.

Если какой-то пункт показывает старый текст («Лид…») — пришлите
скриншот, релиз откатывать не нужно, разберём точечно.
