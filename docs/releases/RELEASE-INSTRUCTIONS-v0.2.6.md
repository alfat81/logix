# Инструкция владельца: деплой v0.2.6 (24.10.2026)

Время: ~15 минут. Все команды — готовые блоки для вставки в PowerShell
(D20). Выполняйте строго по порядку. Если контрольная точка показала
не то, что ожидается, — ОСТАНОВИТЕСЬ и пришлите мне вывод команды в чат,
ничего не коммитите.

**В этом релизе есть миграция базы данных** (шаг 4) — вторая по счёту.
Она переносит значения анкет из JSON в новые поля (откуда/куда, тип,
дата, вес, объём, места) и ничего не удаляет. Порядок строгий: сначала
миграция, потом коммит и пуш. Команда миграции — с версией CLI
(`npx prisma@6`), как договорились по уроку 24.10.

**Важно:** публикуем релиз только командами git из PowerShell.
Загрузка файлов через сайт GitHub (кнопка «Add file → Upload files»)
для релизов запрещена.

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
  `d6985fa release v0.2.5: …`. `git status` — «working tree clean».
  Если лог показывает другой коммит — пришлите мне вывод всего блока,
  ничего не делайте дальше.

## 1. Распаковать релизный архив в клон

```powershell
Remove-Item .\logix-v0.2.5.zip -ErrorAction SilentlyContinue
Expand-Archive -Path .\logix-v0.2.6.zip -DestinationPath . -Force
```

Файлы лягут поверх клона с заменой. Ошибка «файл занят/используется» —
закройте редакторы, которые могли открыть файлы проекта, повторите блок.

## 2. Контрольная точка 1: версия архива

```powershell
Select-String -Path .\package.json -Pattern '"version"'
```

**Ожидается:** `"version": "0.2.6"`.

Другая версия — распаковался не тот архив или не в ту папку.
ОСТАНОВИТЕСЬ, пришлите мне вывод этой команды и `Get-ChildItem .\*.zip`.

## 3. Контрольная точка 2: состав изменений перед миграцией и коммитом

```powershell
git status --short
```

**Ожидается ровно 29 строк.**

Изменённые (строки начинаются с `M`) — 25 штук:

- `CHANGELOG.md`
- `docs/ROADMAP.md`
- `package.json`
- `prisma/schema.prisma`
- `scripts/e2e_api_test.py`
- `src/app/admin/(dashboard)/orders/[id]/page.tsx`
- `src/app/admin/orders/[id]/print/page.tsx`
- `src/app/api/admin/leads/[id]/convert/route.ts`
- `src/app/api/admin/leads/[id]/route.ts`
- `src/app/api/admin/leads/route.ts`
- `src/app/api/admin/orders/[id]/route.ts`
- `src/app/api/admin/orders/route.ts`
- `src/app/api/client/leads/[id]/route.ts`
- `src/app/api/client/leads/route.ts`
- `src/components/admin/CargoGroups.tsx`
- `src/components/admin/LeadCard.tsx`
- `src/components/admin/LeadEditDialog.tsx`
- `src/components/admin/LeadsList.tsx`
- `src/components/admin/OrdersList.tsx`
- `src/components/client/ClientHome.tsx`
- `src/components/client/ClientLeadCard.tsx`
- `src/lib/client-constants.ts`
- `src/lib/lead-edit.ts`
- `src/lib/leads.ts`
- `src/lib/orders.ts`

Новые (строки начинаются с `??`) — 4 штуки:

- `docs/releases/RELEASE-INSTRUCTIONS-v0.2.6.md`
- `docs/releases/RELEASE-NOTES-v0.2.6.md`
- `prisma/migrations/20261024133844_p1_03_route_fields/migration.sql`
- `src/lib/route-fields.ts`

**Обязательно:** 21 строка с `src/…` и строка миграции
`prisma/migrations/…`. Если строк сильно меньше, нет строк с `src/`
или появились лишние — ОСТАНОВИТЕСЬ, пришлите мне полный вывод
`git status --short`.

## 4. Миграция базы данных (протокол А, решение D16)

Команда применит вторую миграцию к прод-базе Neon: добавит поля
маршрута и груза и перенесёт значения из анкет (JSON). Данные не
удаляются. Node.js LTS уже стоит; в `.env` в клоне строка
`DATABASE_URL` есть — она переживает все наши сбросы клона.

Проверка окружения:

```powershell
node --version
Select-String -Path .\.env -Pattern 'DATABASE_URL'
```

- `node --version` печатает версию — идите дальше. Вторая команда
  показывает `DATABASE_URL="postgresql://…neon.tech…"` — идите дальше.
  Что-то не так — стоп, вывод мне в чат.

Сама миграция:

```powershell
npx prisma@6 migrate deploy
```

- На вопрос npx «Need to install… Ok to proceed? (y)» — нажмите `y`.
- **Ожидается:** `2 migrations found` (или одна применённая), строка
  `20261024133844_p1_03_route_fields` со словом `applied`, в конце
  «Your database is now in sync with your schema».
- Повторный запуск ответит «No pending migrations to apply» — это
  нормально.
- Любая ошибка — стоп, копия вывода мне в чат. НЕ повторяйте вслепую.

## 5. Закоммитить и запушить

Только если контрольные точки шагов 2–3 совпали и миграция (шаг 4)
прошла:

```powershell
git add -A
git commit -m "release v0.2.6: P1-03 маршрут и груз — поля вместо JSON (колонки Lead/Order + миграция с backfill + фильтры направлений/типа + печатная форма)"
git push origin main
```

Пуш должен пройти без ошибок. Если отклонился — НЕ делайте `git pull`
сами, пришлите мне текст ошибки в чат.

## 6. Проверить состав коммита на GitHub (контрольная точка 3)

Откройте https://github.com/alfat81/logix/commits/main — верхний коммит
`release v0.2.6: …`. Зайдите в него: должно быть написано
**«29 files changed»**, в списке есть
`prisma/migrations/20261024133844_p1_03_route_fields/migration.sql`,
`src/lib/route-fields.ts` и `package.json`.

## 7. Дождаться зелёного CI (GitHub → Actions)

CI должен быть зелёным, включая «Unit-тесты (vitest)» и «e2e API
(PostgreSQL)». Красный — не паникуем: пришлите лог (Actions → упавший
job → Copy raw logs). Откат одной командой:

```powershell
git revert HEAD --no-edit
git push
```

Миграция при откате НЕ отменяется — это нормально: колонки совместимы
со старым кодом.

## 8. Дождаться деплоя Vercel

Deployments → последний коммит → Status: Ready. Новые env-переменные
не требуются, Redeploy вручную не нужен.

## 9. Smoke на проде (~5 минут)

1. Открыть `<ваш-адрес>/api/health` → `{"status":"ok","db":"ok"}`,
   поле `version` — новый SHA (не `d6985fa`).
2. Войти мастером.
3. **Заявки**: под фильтрами ответственного появилась строка
   «Откуда → Куда (Тип)». Введите «Китай» в «Откуда», выберите
   «Море» в типе — список сократится до заявок с таким направлением.
4. **Карточка заявки**: в «Груз и маршрут» поля маршрута заполнены из
   анкеты (у старых заявок — перенесённые из JSON значения); блок
   «Прочее» появился, если в анкете были нестандартные поля.
5. **Правка груза заявки**: кнопкой карандаша измените вес и
   сохраните — в журнале заявки запись вида «Вес: 1 200 → 1 450».
6. **Лиды**: та же строка фильтров в списке лидов.

Домен может быть недоступен из России без VPN (решение D17) — это не
признак поломки.

## Если что-то пошло не так

- Любая контрольная точка не совпала — стоп, вывод команды мне в чат.
- Миграция упала с ошибкой — НЕ повторяйте вслепую, пришлите вывод
  `npx prisma@6 migrate deploy` целиком. Хотите резервный путь через
  Neon SQL Editor (протокол Б) — скажите, пришлю готовые SQL-блоки.
- Откат кода: блок из шага 7 → Vercel передеплоит предыдущее
  состояние. Миграцию при откате не трогаем.
