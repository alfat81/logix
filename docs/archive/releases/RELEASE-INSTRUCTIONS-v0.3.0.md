# Инструкция владельца: деплой v0.3.0 (24.10.2026)

Время: ~10 минут. Все команды — готовые блоки для вставки в PowerShell
(D20). Выполняйте строго по порядку. Если контрольная точка показала
не то, что ожидается, — ОСТАНОВИТЕСЬ и пришлите мне вывод команды в чат,
ничего не коммитите.

**В этом релизе миграций НЕТ** — меняется только интерфейс: статусные
бейджи-«таблетки» во всех кабинетах, правая панель «Детали/Журнал» на
карточке заявки, резка двух больших файлов и печатная форма на брендовых
токенах. Схема базы не трогается. В архив также входит обновлённый
брендбук v1.2 (D24 — дополнение по вашим референс-макетам).

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
  `63fb6fe release v0.2.9: …`. `git status` — «working tree clean».
  Если лог показывает другой коммит — пришлите мне вывод всего блока,
  ничего не делайте дальше.

## 1. Распаковать релизный архив в клон

Скачайте `logix-v0.3.0.zip` из чата в папку `C:\PROJECTS\logix`,
затем скопируйте блок целиком:

```powershell
Remove-Item .\logix-v0.2.9.zip -ErrorAction SilentlyContinue
Expand-Archive -Path .\logix-v0.3.0.zip -DestinationPath . -Force
```

Файлы лягут поверх клона с заменой. Ошибка «файл занят/используется» —
закройте редакторы, которые могли открыть файлы проекта, повторите блок.

## 2. Контрольная точка 1: версия архива

```powershell
Select-String -Path .\package.json -Pattern '"version"'
```

**Ожидается:** `"version": "0.3.0"`.

Другая версия — распаковался не тот архив или не в ту папку.
ОСТАНОВИТЕСЬ, пришлите мне вывод этой команды и `Get-ChildItem .\*.zip`.

## 3. Контрольная точка 2: состав изменений перед коммитом

```powershell
git status --short
```

**Ожидается ровно 33 строки: 18 изменённых (M) + 15 новых (??).**

Изменённые (строки начинаются с `M`) — 18 штук:

- `CHANGELOG.md`
- `docs/BRANDBOOK.md`
- `docs/DECISIONS.md`
- `docs/ROADMAP.md`
- `package.json`
- `src/app/admin/(dashboard)/orders/[id]/page.tsx`
- `src/app/admin/orders/[id]/print/print.css`
- `src/app/globals.css`
- `src/components/admin/ContractorPoolSection.tsx`
- `src/components/admin/CustomerCabinetAccess.tsx`
- `src/components/admin/CustomerCard.tsx`
- `src/components/admin/LeadCard.tsx`
- `src/components/admin/LeadsList.tsx`
- `src/components/admin/OrdersList.tsx`
- `src/components/client/ClientBadges.tsx`
- `src/components/contractor/ContractorOrdersList.tsx`
- `src/components/documents/DocumentsSection.tsx`
- `src/components/ui/badge.tsx`

Новые (строки начинаются с `??`) — 15 штук:

- `docs/releases/RELEASE-INSTRUCTIONS-v0.3.0.md`
- `docs/releases/RELEASE-NOTES-v0.3.0.md`
- `src/components/admin/InfoField.tsx`
- `src/components/admin/lead/` (каталог: types, LeadAnketaCard,
  LeadConvertBlock, LeadStatusControls)
- `src/components/admin/order/` (каталог: types, quote-snapshot,
  OrderCargoCard, OrderQuoteCard, OrderQuoteDialog, OrderStages,
  StageCard)
- `src/lib/status-badges.ts`

Строки каталогов `lead/` и `order/` покажутся одной строкой `??` каждая —
это нормально (git сворачивает каталог). Если строк сильно меньше, нет
строк с `src/…` или появились лишние — ОСТАНОВИТЕСЬ, пришлите мне полный
вывод `git status --short`.

## 4. Закоммитить и запушить

Только если контрольные точки 1–2 совпали:

```powershell
git add -A
git commit -m "release v0.3.0: P1-19 брендбук C - бейджи-таблетки статусов во всех кабинетах + панель Детали/Журнал на заявке + резка монолитов и печать на токенах брендбука (без миграций)"
git push origin main
```

Пуш должен пройти без ошибок. Если отклонился — НЕ делайте `git pull`
сами, пришлите мне текст ошибки в чат.

## 5. Проверить состав коммита на GitHub (контрольная точка 3)

Откройте https://github.com/alfat81/logix/commits/main — верхний коммит
`release v0.3.0: …`. Зайдите в него: должно быть написано
**«33 files changed»**, в списке есть `status-badges.ts`, каталоги
`admin/lead/` и `admin/order/`, `badge.tsx`, `print.css` и
`BRANDBOOK.md`.

## 6. Дождаться зелёного CI (GitHub → Actions)

CI должен быть зелёным, включая «Unit-тесты (vitest)» и «e2e API
(PostgreSQL)». Красный — не паникуем: пришлите лог (Actions → упавший
job → Copy raw logs). Откат одной командой:

```powershell
git revert HEAD --no-edit
git push
```

База при откате не затрагивается — миграций в релизе нет.

## 7. Дождаться деплоя Vercel

Deployments → последний коммит → Status: Ready. Новые env-переменные
не требуются, Redeploy вручную не нужен. Сборка может идти чуть дольше
обычного — в релизе 15 новых файлов, это норма.

## 8. Smoke на проде (~7 минут)

1. Открыть `<ваш-адрес>/api/health` → `{"status":"ok","db":"ok"}`,
   поле `version` — новый SHA (не `63fb6fe`).
2. Войти мастером → **Заявки**: у каждой карточки статус справа стал
   «таблеткой» (заглавные, полное скругление): «В РАБОТЕ» — тёплая
   розовая, «ЗАВЕРШЕНА» — зелёная, «РАСЧЁТ»/«СОГЛАСОВАНИЕ» — светло-
   коралловые; вместо красного «Просрочка» — коралловая таблетка
   «ПРОСРОЧКА». Тексты и данные — прежние.
3. **Карточка заявки:** справа появилась sticky-панель «Внутренняя
   заметка» + «Журнал событий» (как у лида, 320px); сузьте окно до
   ~1000px — панель складывается вниз, ничего не ломается.
4. **Статусы этапов** в карточке заявки — тоже таблетки: «ГОТОВО» —
   зелёная, «В РАБОТЕ» — тёплая, «ПРОБЛЕМА» — коралловая.
5. **Лид:** статус («НОВЫЙ»/«РАССЧИТАН») — таблетка; справа панель
   Журнала — как было после v0.2.9.
6. **Печатная форма** (кнопка «Печатная форма» на заявке → открыть в
   новой вкладке): тулбар тёмный (Ink), кнопка печати — кирпичная
   (Brick), сам бланк — чёрный, как раньше.
7. **Кабинет клиента/подрядчика** (если удобно): статусы в списках —
   те же таблетки.
8. **Данные не изменились:** суммы, варианты, журналы, документы —
   прежние.

Домен может быть недоступен из России без VPN (решение D17) — это не
признак поломки.

## Если что-то пошло не так

- Любая контрольная точка не совпала — стоп, вывод команды мне в чат.
- Откат кода: блок из шага 6 → Vercel передеплоит предыдущее состояние.
  Базу трогать не нужно — миграций в релизе нет.
