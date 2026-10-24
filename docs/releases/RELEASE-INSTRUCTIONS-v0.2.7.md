# Инструкция владельца: деплой v0.2.7 (24.10.2026)

Время: ~15 минут. Все команды — готовые блоки для вставки в PowerShell
(D20). Выполняйте строго по порядку. Если контрольная точка показала
не то, что ожидается, — ОСТАНОВИТЕСЬ и пришлите мне вывод команды в чат,
ничего не коммитите.

**В этом релизе есть миграция базы данных** (шаг 4) — третья по счёту.
Она переводит денежные поля в Decimal с валютой, добавляет режим НДС и
себестоимость. Значения не теряются. Порядок строгий: сначала миграция,
потом коммит и пуш. По уроку 24.10 (v0.2.6) блок миграции начинается с
проверки версии архива — **миграция выполняется только после
распаковки**.

**Важно:** публикуем релиз только командами git из PowerShell.
Загрузка файлов через сайт GitHub (кнопка «Add file → Upload files»)
для релизов запрещена.

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
  `af4b200 release v0.2.6: …`. `git status` — «working tree clean».
  Если лог показывает другой коммит — пришлите мне вывод всего блока,
  ничего не делайте дальше.

## 1. Распаковать релизный архив в клон

Скачайте `logix-v0.2.7.zip` из чата в папку `C:\PROJECTS\logix`,
затем скопируйте блок целиком:

```powershell
Remove-Item .\logix-v0.2.6.zip -ErrorAction SilentlyContinue
Expand-Archive -Path .\logix-v0.2.7.zip -DestinationPath . -Force
```

Файлы лягут поверх клона с заменой. Ошибка «файл занят/используется» —
закройте редакторы, которые могли открыть файлы проекта, повторите блок.

## 2. Контрольная точка 1: версия архива

```powershell
Select-String -Path .\package.json -Pattern '"version"'
```

**Ожидается:** `"version": "0.2.7"`.

Другая версия — распаковался не тот архив или не в ту папку.
ОСТАНОВИТЕСЬ, пришлите мне вывод этой команды и `Get-ChildItem .\*.zip`.

## 3. Контрольная точка 2: состав изменений перед миграцией и коммитом

```powershell
git status --short
```

**Ожидается ровно 28 строк.**

Изменённые (строки начинаются с `M`) — 19 штук:

- `CHANGELOG.md`
- `docs/DECISIONS.md`
- `docs/ROADMAP.md`
- `docs/RULES.md`
- `package.json`
- `prisma/schema.prisma`
- `scripts/e2e_api_test.py`
- `src/app/admin/(dashboard)/orders/[id]/page.tsx`
- `src/app/admin/orders/[id]/print/page.tsx`
- `src/app/api/admin/leads/[id]/convert/route.ts`
- `src/app/api/admin/leads/[id]/options/route.ts`
- `src/app/api/admin/options/[id]/route.ts`
- `src/app/api/broker/leads/[id]/estimate/route.ts`
- `src/components/admin/BrokerLinksSection.tsx`
- `src/components/admin/LeadCard.tsx`
- `src/components/admin/LeadsList.tsx`
- `src/components/broker/BrokerEstimateForm.tsx`
- `src/lib/brokers.ts`
- `src/lib/leads.ts`

Новые (строки начинаются с `??`) — 9 штук:

- `docs/BRANDBOOK.md`
- `docs/releases/RELEASE-INSTRUCTIONS-v0.2.7.md`
- `docs/releases/RELEASE-NOTES-v0.2.7.md`
- `prisma/migrations/20261024170000_p1_04_money/migration.sql`
- `src/components/admin/QuoteOptionDialog.tsx`
- `src/components/admin/QuoteOptionFormFields.tsx`
- `src/components/admin/QuoteOptionsSection.tsx`
- `src/lib/money.test.ts`
- `src/lib/money.ts`

**Обязательно:** 17 строк с `src/…` и строка миграции
`prisma/migrations/…`. Если строк сильно меньше, нет строк с `src/`
или появились лишние — ОСТАНОВИТЕСЬ, пришлите мне полный вывод
`git status --short`.

## 4. Миграция базы данных (протокол А, решение D16)

Блок начинается с проверки версии — по уроку v0.2.6 миграция должна
выполняться только из копии, в которую уже распакован релиз. Выполняйте
два блока по очереди.

**Блок 4.1 — контрольная точка версии (перед миграцией):**

```powershell
Select-String -Path .\package.json -Pattern '"version"'
```

**Ожидается:** `"version": "0.2.7"`. Не совпало — СТОП, миграцию не
запускать, вывод мне в чат.

**Блок 4.2 — сама миграция:**

```powershell
npx prisma@6 migrate deploy
```

- На вопрос npx «Need to install… Ok to proceed? (y)» — нажмите `y`.
- **Ожидается:** `4 migrations found`, строка
  `Applying migration 20261024170000_p1_04_money`, в конце
  «All migrations have been successfully applied» (или «Your database
  is now in sync with your schema»).
- Повторный запуск ответит «No pending migrations to apply» — это
  нормально.
- Любая ошибка — стоп, копия вывода мне в чат. НЕ повторяйте вслепую.
  Резервный путь через Neon SQL Editor (протокол Б) — по запросу,
  пришлю готовые SQL-блоки.

## 5. Закоммитить и запушить

Только если контрольные точки шагов 2–3 совпали и миграция (шаг 4)
прошла:

```powershell
git add -A
git commit -m "release v0.2.7: P1-04 деньги - Decimal+валюта+НДС+себестоимость (миграция p1_04_money + lib/money.ts + изоляция cost + брендбук D22/D23)"
git push origin main
```

Пуш должен пройти без ошибок. Если отклонился — НЕ делайте `git pull`
сами, пришлите мне текст ошибки в чат.

## 6. Проверить состав коммита на GitHub (контрольная точка 3)

Откройте https://github.com/alfat81/logix/commits/main — верхний коммит
`release v0.2.7: …`. Зайдите в него: должно быть написано
**«28 files changed»**, в списке есть
`prisma/migrations/20261024170000_p1_04_money/migration.sql`,
`src/lib/money.ts`, `docs/BRANDBOOK.md` и `package.json`.

## 7. Дождаться зелёного CI (GitHub → Actions)

CI должен быть зелёным, включая «Unit-тесты (vitest)» и «e2e API
(PostgreSQL)». Красный — не паникуем: пришлите лог (Actions → упавший
job → Copy raw logs). Откат одной командой:

```powershell
git revert HEAD --no-edit
git push
```

Миграция при откате НЕ отменяется — это нормально: Decimal-колонки
совместимы со старым кодом.

## 8. Дождаться деплоя Vercel

Deployments → последний коммит → Status: Ready. Новые env-переменные
не требуются, Redeploy вручную не нужен.

## 9. Smoke на проде (~5 минут)

1. Открыть `<ваш-адрес>/api/health` → `{"status":"ok","db":"ok"}`,
   поле `version` — новый SHA (не `af4b200`).
2. Войти мастером.
3. **Лид**: откройте любой лид в работе → «Добавить вариант» — в форме
   появились поля «Валюта», «НДС», «Себестоимость». Создайте вариант:
   цена 150000, валюта RUB, НДС «с НДС», себестоимость 120000 →
   карточка варианта покажет «150 000 ₽ · с НДС» и строку
   «· себестоимость: 120 000 ₽».
4. **Лента лида**: запись «Добавлен вариант расчёта: … — 150 000 ₽ ·
   с НДС, 7 дн.» — себестоимость в ленту не пишется.
5. **Правка варианта**: очистите себестоимость и сохраните — строка
   себестоимости исчезнет.
6. **Старые варианты**: цена на месте, формат «1 200 000 ₽ · без НДС»
   (валюта RUB и «без НДС» проставлены миграцией по умолчанию).

Домен может быть недоступен из России без VPN (решение D17) — это не
признак поломки.

## Если что-то пошло не так

- Любая контрольная точка не совпала — стоп, вывод команды мне в чат.
- Миграция упала с ошибкой — НЕ повторяйте вслепую, пришлите вывод
  `npx prisma@6 migrate deploy` целиком. Хотите резервный путь через
  Neon SQL Editor (протокол Б) — скажите, пришлю готовые SQL-блоки.
- Откат кода: блок из шага 7 → Vercel передеплоит предыдущее
  состояние. Миграцию при откате не трогаем.
