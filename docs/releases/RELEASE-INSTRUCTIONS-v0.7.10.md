# RELEASE-INSTRUCTIONS v0.7.10 — DF-22 «Общий вид секций, табов и карточек»

Владелец выполняет в PowerShell из клона `C:\PROJECTS\logix`. База — v0.7.9. **Миграций нет, новых env нет, новых зависимостей нет** — распаковка, контрольные точки, коммит, пуш, зелёный CI. UI-релиз: после деплоя — смоук по списку в конце (визуальная приёмка по скриншотам `download/screenshots-v0.7.10/` и на живом проде).

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
Expand-Archive -Path .\logix-v0.7.10.zip -DestinationPath . -Force
```

**КТ1 — версия:**

```powershell
Select-String -Path .\package.json -Pattern '"version"'
```

Ожидается `"version": "0.7.10"`. Не совпало — стоп, чат агенту.

**КТ2 — состав (перед коммитом):**

```powershell
git status --short
```

Ожидается **19 файлов**: 16 изменённых (`M`) + 3 новых (`??`). Изменённые (`M`, 16):

```
CHANGELOG.md
docs/ROADMAP-DEALFLOW.md
docs/ROADMAP.md
package.json
scripts/knip-baseline.json
src/components/admin/AttentionScreen.tsx
src/components/admin/ContractorLeadsSection.tsx
src/components/admin/ContractorPoolSection.tsx
src/components/admin/NotificationsJournal.tsx
src/components/admin/QuoteOptionsSection.tsx
src/components/admin/SettingsPanel.tsx
src/components/admin/StageCatalogList.tsx
src/components/admin/contractorlead/ContractorLeadActionsDialog.tsx
src/components/admin/contractorlead/ContractorLeadStatusBadge.tsx
src/components/admin/order/OrderStages.tsx
src/components/admin/references/ReferencesScreen.tsx
```

Новые (`??`, 3):

```
docs/releases/RELEASE-INSTRUCTIONS-v0.7.10.md
docs/releases/RELEASE-NOTES-v0.7.10.md
docs/releases/SCOPE-v0.7.10.json
```

`docs/INVENTORY.md` в релизе НЕ меняется (поверхность lib/роутов/моделей не менялась — перегенерация дала нулевой дифф). Если `git status` показывает что-то сверх списка — стоп, чат агенту.

**КТ3 — гард-тесты без прогонов (глазами):** в diff нет файлов из `src/components/broker/`, `src/app/(contractor)/`, `prisma/migrations/`, `src/lib/` — кабинет подрядчика (D31), схема и логика не тронуты.

## Шаг 2. Коммит и пуш

```powershell
git add -A
git commit -m "release v0.7.10: DF-22 — общий вид секций, табов и карточек"
git push origin main
```

Дождаться зелёного CI (`gh run watch` или вкладка Actions): lint + tsc + build + vitest 372 + e2e 434.

## Шаг 3. Смоук после деплоя (визуальная приёмка DF-22)

Эталон сверки — страница «Юрлица» (анатомия карточек там уже правильная). Проверить на проде (desktop 1440):

1. **«Этапы»** (`/admin/stage-catalog`): карточка этапа — строка 1 «N.» + серый тег «ОБЯЗАТЕЛЬНЫЙ» (нейтральная таблетка, НЕ красная), строка 2 название жирным, строка 3 код; «Править» — outline-кнопка справа; стрелки работают.
2. **«Подрядчики»** (`/admin/contractors`): обе секции в белых Card с заголовком «Квалификация»/«Пул» и иконкой; «Новый кандидат» — в шапке секции; фильтры — подчёркнутые табы (не пилюли); карточка кандидата: «с {дата}» + тег статуса сверху, название жирным, контакт ниже; в «Пуле» справа — счётчик этапов и чипы.
3. **«Справочники»** (`/admin/references`): строка — код сверху, название жирным, английское название ниже; справа курс (в валютах) и «Править»; у отключённой записи — серая таблетка «ОТКЛЮЧЕНО», у Инкотермс DAP/DAS — «ПРАВИЛА — ЧЕРНОВИК (O-12)».
4. **«Настройки»** (`/admin/settings`, мастер): группы в Card с иконкой и заголовком обычного размера (не крупнее секций других экранов); поля и кнопки «Сохранить/Сбросить» работают как раньше.
5. **Карточка заявки** (`/admin/orders/{id}`): секция «Этапы» — Card с иконкой, «Добавить этап» в шапке секции; список этапов как был.
6. **Карточка запроса** (`/admin/leads/{id}`): секция «Варианты расчёта» — Card с иконкой, «Добавить вариант» в шапке; у выбранного варианта — рамка Action-icon как была.
7. **«Журнал отправок»** (`/admin/notifications`, мастер): теги статусов — «ОТПРАВЛЕНО» зелёная таблетка с точкой, «ОШИБКА» — красная (критичный сигнал), «ЖДЁТ»/«ПРОПУЩЕНО» — нейтральные.
8. **«Требует внимания»** (`/admin/attention`): при нулях — зелёная таблетка «ЧИСТО»; при проблемах — красный счётчик как был.
9. Телефон 375: страницы «Подрядчики» и «Этапы» не разваливаются (карточки в одну колонку, табы переносятся).

Расхождение с ожиданием — скриншот в чат агенту.
