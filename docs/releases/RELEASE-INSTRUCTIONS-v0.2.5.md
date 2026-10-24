# Инструкция владельца: деплой v0.2.5 (24.10.2026)

Время: ~10 минут. Все команды — готовые блоки для вставки в PowerShell
(D20). Выполняйте строго по порядку. Если контрольная точка показала
не то, что ожидается, — ОСТАНОВИТЕСЬ и пришлите мне вывод команды в чат,
ничего не коммитите.

**В этом релизе миграций базы данных НЕТ** — только код и интерфейс.
Шагов с npx/prisma здесь нет.

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
  `f9e6e40 release v0.2.4: …`. `git status` — «working tree clean».
  Если лог показывает другой коммит — пришлите мне вывод всего блока,
  ничего не делайте дальше.

## 1. Распаковать релизный архив в клон

```powershell
Remove-Item .\logix-v0.2.4.zip -ErrorAction SilentlyContinue
Expand-Archive -Path .\logix-v0.2.5.zip -DestinationPath . -Force
```

Файлы лягут поверх клона с заменой. Ошибка «файл занят/используется» —
закройте редакторы, которые могли открыть файлы проекта, повторите блок.

## 2. Контрольная точка 1: версия архива

```powershell
Select-String -Path .\package.json -Pattern '"version"'
```

**Ожидается:** `"version": "0.2.5"`.

Другая версия — распаковался не тот архив или не в ту папку.
ОСТАНОВИТЕСЬ, пришлите мне вывод этой команды и `Get-ChildItem .\*.zip`.

## 3. Контрольная точка 2: состав изменений перед коммитом

```powershell
git status --short
```

**Ожидается ровно 16 строк.**

Изменённые (строки начинаются с `M`) — 12 штук:

- `CHANGELOG.md`
- `docs/ROADMAP.md`
- `docs/RULES.md`
- `docs/releases/RELEASE-INSTRUCTIONS-v0.2.4.md`
- `package.json`
- `scripts/e2e_api_test.py`
- `src/app/api/admin/leads/[id]/route.ts`
- `src/app/api/client/leads/[id]/route.ts`
- `src/components/admin/LeadCard.tsx`
- `src/components/client/ClientLeadCard.tsx`
- `src/lib/activity.ts`
- `src/lib/leads.ts`

Новые (строки начинаются с `??`) — 4 штуки:

- `docs/releases/RELEASE-INSTRUCTIONS-v0.2.5.md`
- `docs/releases/RELEASE-NOTES-v0.2.5.md`
- `src/components/admin/LeadEditDialog.tsx`
- `src/lib/lead-edit.ts`

Пояснение: правка `docs/releases/RELEASE-INSTRUCTIONS-v0.2.4.md` —
исправленная команда миграции (`npx prisma@6`) из урока 24.10, она
не попала на GitHub с релизом v0.2.4 и уходит теперь.

**Обязательно:** 8 строк с `src/…`. Если строк сильно меньше, нет
строк с `src/` или появились лишние — ОСТАНОВИТЕСЬ, пришлите мне
полный вывод `git status --short`.

## 4. Закоммитить и запушить

Только если контрольные точки шагов 2–3 совпали:

```powershell
git add -A
git commit -m "release v0.2.5: P1-02 редактирование анкеты лида (rawContact/cargoInfo в окне new/calculated + diff в журнале + правка клиентом до вариантов)"
git push origin main
```

Пуш должен пройти без ошибок: клон синхронизирован в шаге 0.
Если push отклонился — НЕ делайте `git pull` сами, пришлите мне текст
ошибки в чат.

## 5. Проверить состав коммита на GitHub (контрольная точка 3)

Откройте https://github.com/alfat81/logix/commits/main — верхний коммит
`release v0.2.5: …`. Зайдите в него: должно быть написано
**«16 files changed»**, в списке есть `src/components/admin/LeadEditDialog.tsx`,
`src/lib/lead-edit.ts` и `package.json`.

## 6. Дождаться зелёного CI (GitHub → Actions)

CI должен быть зелёным, включая шаг «Unit-тесты (vitest)» и «e2e API
(PostgreSQL)». Красный CI — не паникуем: пришлите лог (Actions →
упавший job → Copy raw logs). Откат одной командой:

```powershell
git revert HEAD --no-edit
git push
```

## 7. Дождаться деплоя Vercel

Deployments → последний коммит → Status: Ready. Новые env-переменные
не требуются, Redeploy вручную не нужен.

## 8. Smoke на проде (~5 минут)

1. Открыть `<ваш-адрес>/api/health` → `{"status":"ok","db":"ok"}` —
   поле `version` должно показывать новый SHA коммита (не `f9e6e40`).
2. Войти мастером (телефон + пароль).
3. **Лид в статусе «Новый» или «Рассчитан»**: в карточке на блоке
   «Анкета запроса» появилась кнопка **«Править анкету»**. Откройте её,
   поменяйте вес на любое число, сохраните: в журнале лида верхнее
   событие — «Вес: …старое… → …новое…».
4. **Лид после конвертации (won)**: кнопки «Править анкету» нет.
5. Создайте тестовый лид, откройте анкету на правку, очистите вес
   и сохраните — в журнале «Вес: … → —».

Домен может быть недоступен из России без VPN (решение D17) — это не
признак поломки.

## Если что-то пошло не так

- Любая контрольная точка не совпала — стоп, вывод команды мне в чат.
- Откат кода: блок из шага 6 → Vercel передеплоит предыдущее состояние.
  Миграций в релизе нет, базу трогать не нужно.
