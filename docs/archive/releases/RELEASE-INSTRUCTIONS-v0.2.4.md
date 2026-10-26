# Инструкция владельца: деплой v0.2.4 (24.10.2026)

Время: ~15 минут. Все команды — готовые блоки для вставки в PowerShell
(D20). Выполняйте строго по порядку. Если контрольная точка показала
не то, что ожидается, — ОСТАНОВИТЕСЬ и пришлите мне вывод команды в чат,
ничего не коммитите.

**В этом релизе есть миграция базы данных** (шаг 4) — впервые. Она
не удаляет данные. Порядок строгий: сначала миграция, потом коммит
и пуш.

**Важно:** публикуем релиз только командами git из PowerShell.
Загрузка файлов через сайт GitHub (кнопка «Add file → Upload files»)
для релизов запрещена — именно так 24.10 на GitHub ушёл неполный
коммит из 4 файлов документации без кода.

## 0. Привести клон в чистое состояние (работает из любого текущего)

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
  `22bc000 release v0.2.3: …`. `git status` — «working tree clean».
  Если лог показывает другой коммит — пришлите мне вывод всего блока,
  ничего не делайте дальше.

## 1. Распаковать релизный архив в клон

```powershell
Remove-Item .\logix-v0.2.0.zip, .\logix-v0.2.1.zip, .\logix-v0.2.2.zip, .\logix-v0.2.3.zip -ErrorAction SilentlyContinue
Expand-Archive -Path .\logix-v0.2.4.zip -DestinationPath . -Force
```

Файлы лягут поверх клона с заменой. Ошибка «файл занят/используется» —
закройте редакторы, которые могли открыть файлы проекта, повторите блок.

## 2. Контрольная точка 1: версия архива

```powershell
Select-String -Path .\package.json -Pattern '"version"'
```

**Ожидается:** `"version": "0.2.4"`.

Другая версия — распаковался не тот архив или не в ту папку.
ОСТАНОВИТЕСЬ, пришлите мне вывод этой команды и `Get-ChildItem .\*.zip`.

## 3. Контрольная точка 2: состав изменений перед миграцией и коммитом

```powershell
git status --short
```

**Ожидается ровно 23 строки.**

Изменённые (строки начинаются с `M`) — 19 штук:

- `CHANGELOG.md`
- `docs/DECISIONS.md`
- `docs/ROADMAP.md`
- `docs/RULES.md`
- `package.json`
- `prisma/schema.prisma`
- `scripts/e2e_api_test.py`
- `src/app/admin/(dashboard)/orders/[id]/page.tsx`
- `src/app/api/admin/leads/[id]/convert/route.ts`
- `src/app/api/admin/leads/[id]/route.ts`
- `src/app/api/admin/leads/route.ts`
- `src/app/api/admin/orders/[id]/route.ts`
- `src/app/api/admin/orders/route.ts`
- `src/components/admin/LeadCard.tsx`
- `src/components/admin/LeadsList.tsx`
- `src/components/admin/OrdersList.tsx`
- `src/lib/activity.ts`
- `src/lib/leads.ts`
- `src/lib/orders.ts`

Новые (строки начинаются с `??`) — 4 штуки:

- `docs/releases/RELEASE-INSTRUCTIONS-v0.2.4.md`
- `docs/releases/RELEASE-NOTES-v0.2.4.md`
- `prisma/migrations/20261024113629_p1_01_responsible_manager/migration.sql`
- `src/components/admin/AssigneeField.tsx`

**Обязательно:** 13 строк с `src/…` и строка миграции `prisma/migrations/…`.
Если строк сильно меньше, нет строк с `src/` или появились лишние —
ОСТАНОВИТЕСЬ, пришлите мне полный вывод `git status --short`.

## 4. Миграция базы данных (протокол А, решение D16) — НОВОЕ

Команда применяет миграцию к прод-базе Neon: добавит колонки
ответственного и заполнит их создателями из журнала. Данные не
удаляются. Требуется Node.js LTS (ставился по шагу 9 инструкции v0.2.3).

Сначала проверка, что в клоне есть строка подключения к базе:

```powershell
node --version
Select-String -Path .\.env -Pattern 'DATABASE_URL'
```

- `node --version` должен напечатать версию (v22…). Если «node не является
  командой» — установите Node.js LTS с https://nodejs.org (настройки по
  умолчанию), откройте НОВОЕ окно PowerShell и повторите блок.
- Вторая команда должна показать строку вида
  `DATABASE_URL="postgresql://…neon.tech…"`. Если `.env` отсутствует или
  строки нет — стоп: скопируйте строку DATABASE_URL из Vercel
  (проект → Settings → Environment Variables → Production), сохраните в
  файл `.env` в клоне и повторите проверку. Не получается — пишите мне
  в чат.

Затем сама миграция:

```powershell
npx prisma@6 migrate deploy
```

- Версия `@6` обязательна: в проекте Prisma 6.19.2. Если запускать
  `npx prisma` без версии, скачается Prisma 8 (RC), где команда
  `migrate deploy` переименована — вы могли это уже видеть (ошибка
  CLI.COMMAND_MOVED). Совет «prisma db migrate» из этого сообщения
  НЕ применяйте — он для 8-й версии.
- На вопрос npx «Need to install the following packages: prisma@6.x.x.
  Ok to proceed? (y)» — нажмите `y` (скачается CLI Prisma 6, это разово
  и безопасно).
- **Ожидается:** строка `Datasource "db": PostgreSQL database …neon.tech`,
  затем `1 migration found` и `Applying migration
  20261024113629_p1_01_responsible_manager`, в конце
  «Your database is now in sync with your schema».
  Любая ошибка — стоп, копия вывода мне в чат.
- Миграция идемпотентна: повторный запуск ответит «No pending migrations
  to apply» — это нормально.

## 5. Закоммитить и запушить

Только если контрольные точки шагов 2–3 совпали и миграция (шаг 4)
прошла:

```powershell
git add -A
git commit -m "release v0.2.4: P1-01 ответственный менеджер (assignedToId + фильтры/сортировка + AssigneeField) + первая миграция с backfill из Activity"
git push origin main
```

Пуш должен пройти без ошибок: клон синхронизирован в шаге 0.
Если push отклонился — НЕ делайте `git pull` сами, пришлите мне текст
ошибки в чат.

## 6. Проверить состав коммита на GitHub (контрольная точка 3)

Откройте https://github.com/alfat81/logix/commits/main — верхний коммит
`release v0.2.4: …`. Зайдите в него: должно быть написано
**«23 files changed»**, в списке есть `src/components/admin/AssigneeField.tsx`,
`prisma/migrations/20261024113629_p1_01_responsible_manager/migration.sql`
и `package.json`.

Это признак полного релиза: в прошлый раз коммит содержал только
4 файла документации.

## 7. Дождаться зелёного CI (GitHub → Actions)

CI должен быть зелёным, включая шаг «Unit-тесты (vitest)». Красный CI —
не паникуем: пришлите лог (Actions → упавший job → Copy raw logs).
Откат одной командой:

```powershell
git revert HEAD --no-edit
git push
```

Миграция при откате НЕ отменяется — это нормально: колонки совместимы
со старым кодом (они просто не используются).

## 8. Дождаться деплоя Vercel

Deployments → последний коммит → Status: Ready. Новые env-переменные
не требуются, Redeploy вручную не нужен.

## 9. Smoke на проде (~5 минут)

1. Открыть `<ваш-адрес>/api/health` → `{"status":"ok","db":"ok"}`.
2. Войти мастером (телефон + пароль).
3. **Лиды**: в списке появилась колонка «Ответственный» (у старых лидов —
   имя создателя) и кнопки «Мои / Без ответственного»; сортировка
   «Давно без движения» меняет порядок.
4. **Карточка лида**: поле «Ответственный» с выбором сотрудника —
   смените на любого, затем откройте журнал: верхнее событие —
   «Ответственный: … → …».
5. **Заявки**: то же самое — колонка, фильтр, смена в карточке.
6. Создайте тестовый лид — он сразу с вашим именем в «Ответственном».

Домен может быть недоступен из России без VPN (решение D17) — это не
признак поломки.

## Если что-то пошло не так

- Любая контрольная точка не совпала — стоп, вывод команды мне в чат.
- Миграция упала с ошибкой — НЕ повторяйте вслепую, пришлите вывод
  `npx prisma migrate deploy` целиком.
- Откат кода: блок из шага 7 → Vercel передеплоит предыдущее состояние.
  Миграцию при откате не трогаем.
