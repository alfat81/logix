# RELEASE-INSTRUCTIONS v0.7.8 — DF-21 «Панель заявки и меню по макетам»

Владелец выполняет в PowerShell из клона `C:\PROJECTS\logix`. База — v0.7.7. **Миграций нет, новых env нет, новых зависимостей нет** — распаковка, контрольные точки, коммит, пуш, зелёный CI. UI-релиз: после деплоя — смоук по списку в конце.

## Шаг 0. Синхронизация клона (до распаковки!)

```powershell
git fetch origin
git status
```

Если ветка behind `origin/main` и локальных коммитов нет:

```powershell
git reset --hard origin/main
```

Если есть локальные коммиты или незавершённый rebase/merge — чат агенту, самому не мержить.

## Шаг 1. Распаковка архива

```powershell
Expand-Archive -Path .\logix-v0.7.8.zip -DestinationPath . -Force
```

**КТ1 — версия:**

```powershell
Select-String -Path .\package.json -Pattern '"version"'
```

Ожидается `"version": "0.7.8"`. Не совпало — стоп, чат агенту.

**КТ2 — состав (перед коммитом):**

```powershell
git status --short
```

Ожидается **41 файл**: 32 изменённых (`M`) + 9 новых (`??`). Изменённые (`M`, 32):

```
CHANGELOG.md
docs/DECISIONS.md
docs/INVENTORY.md
docs/ROADMAP-DEALFLOW.md
docs/ROADMAP.md
docs/RULES.md
package.json
scripts/e2e_api_test.py
scripts/integrity-baseline.json
scripts/run-e2e-fix1.sh
src/app/admin/(dashboard)/layout.tsx
src/app/admin/(dashboard)/orders/[id]/page.tsx
src/app/api/admin/leads/[id]/notes/route.ts
src/app/api/admin/orders/[id]/notes/route.ts
src/app/api/admin/orders/route.ts
src/app/api/client/leads/[id]/route.ts
src/app/api/client/orders/[id]/route.ts
src/components/admin/ActivityFeed.tsx
src/components/admin/AdminNav.tsx
src/components/admin/LeadCard.tsx
src/components/admin/NoteForm.tsx
src/components/admin/OrderCard.tsx
src/components/admin/OrdersList.tsx
src/components/admin/customs/CustomsAllocationSelects.tsx
src/components/admin/customs/CustomsCalcForm.tsx
src/components/admin/customs/CustomsCalcResult.tsx
src/components/admin/customs/CustomsCalcScreen.tsx
src/components/admin/customs/CustomsFxInputs.tsx
src/components/admin/customs/CustomsItemsEditor.tsx
src/components/client/ClientLeadCard.tsx
src/components/client/ClientOrderCard.tsx
src/lib/activity.ts
```

Новые (`??`, 9):

```
docs/releases/RELEASE-INSTRUCTIONS-v0.7.8.md
docs/releases/RELEASE-NOTES-v0.7.8.md
docs/releases/SCOPE-v0.7.8.json
src/components/admin/AdminBottomNav.tsx
src/components/admin/nav-config.test.ts
src/components/admin/nav-config.ts
src/components/admin/order/OrderSidePanel.tsx
src/lib/order-counts.test.ts
src/lib/order-counts.ts
```

Примечания к составу:
- миграций в `prisma/migrations/` быть НЕ должно; `prisma/schema.prisma` не менялся — появление строк с ними — стоп, чат агенту;
- `docs/RULES.md` + `docs/DECISIONS.md` — формальная фиксация решения владельца D46 (язык общения), принятого 30.10 после релиза 0.7.7 (см. RELEASE-NOTES, «Решения по реализации»);
- `scripts/run-e2e-fix1.sh` — служебный скрипт песочницы (полный лог e2e), в прод не влияет.

Расхождение по числу/составу — стоп, чат агенту.

**КТ2б — файлы ≤ 300 строк (IC-09, выборочно):**

```powershell
(Get-Content src\components\admin\order\OrderSidePanel.tsx).Count
(Get-Content src\app\admin\(dashboard)\orders\[id]\page.tsx).Count
```

Ожидается ≤ 300 в обоих.

## Шаг 2. Коммит и пуш

```powershell
# Одинарные кавычки PowerShell: внутри НЕ должно быть двойных и
# типографских (кавычки-ёлочки и пр.) — урок v0.7.4.
git add -A
git commit -m 'release v0.7.8: DF-21 — панель заявки и меню по макетам: правая панель карточки заявки 320px с вкладками События/Документы/Расчёт (номер панели = номеру шапки), заметка с переключателем внутренняя/видна клиенту (журнал теперь и в кабинете клиента), метки видно клиенту/внутреннее у событий, меню из одного источника с гард-тестом (без Котировки/Мониторинг/Перевозчики), бейдж Заявки из одного источника с табами, нижняя навигация и Назад на телефоне, фильтры под кнопкой Фильтры'
git log --oneline -2
git push origin main
```

`git log --oneline -2` обязан показать верхним `release v0.7.8: …` — коммит создался. Не показал — стоп, чат агенту.

## Шаг 3. CI

Дождаться зелёного GitHub Actions (checks + integrity + e2e + заморозка + gitleaks). Красный — прислать лог агенту; откат `git revert HEAD --no-edit && git push`.

## Шаг 4. Vercel

Deployments → Ready. Env не менялись — redeploy не требуется (Vercel соберёт сам после пуша).

## Шаг 5. Smoke (прод)

1. Вход мастера → меню: пункты **Пульс, Заявки, Запросы, Клиенты, Брокеры, Подрядчики, Справочники, Настройки** (и существующие Договоры/Юрлица/Этапы/Сотрудники/Журнал отправок); разделов «Котировки», «Мониторинг», «Перевозчики» нет.
2. Число на бейдже «Заявки» = сумма табов «Расчёт + Согласование + В работе» на странице списка.
3. Список заявок: у карточки — один тег статуса, строка «Ближайший этап: …», плашка «Ждёт: …»; красный — только у просрочки.
4. Открыть заявку: справа панель «Заявка № N» (номер = шапка), вкладки «События | Документы | Расчёт»:
   - «События»: лента с метками «видно клиенту»/«внутреннее»; внизу заметка с переключателем — написать одну «видна клиенту»;
   - «Документы»: список с версиями и «+ Добавить»;
   - «Расчёт»: карточка расчёта платежей (компактная), кнопки «Править/Пересчитать» работают.
5. Кабинет клиента (инкогнито, доступ клиента): карточка заявки — секция «Журнал событий» с заметкой из п.4; меток «внутреннее» у клиента нет.
6. Телефон (375 px, F12 → iPhone SE или реальный): нижняя панель навигации; список карточками; фильтры «Откуда/Куда/Тип» — под кнопкой «Фильтры», подписи не обрезаны; заявка открывается отдельным экраном с «Назад» и вкладками.
7. Сузить окно до ~1100 px: «Откуда/Куда/Тип» уходят под кнопку «Фильтры».
