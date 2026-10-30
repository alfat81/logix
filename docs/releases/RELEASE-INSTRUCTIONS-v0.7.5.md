# RELEASE-INSTRUCTIONS v0.7.5 — DF-07: «Пульс» владельца

Владелец выполняет в PowerShell из клона `C:\PROJECTS\logix`. База — v0.7.4. **Миграций нет, новых env нет, новых зависимостей нет** — распаковка, контрольные точки, коммит, пуш.

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
Expand-Archive -Path .\logix-v0.7.5.zip -DestinationPath . -Force
```

**КТ1 — версия:**

```powershell
Select-String -Path .\package.json -Pattern '"version"'
```

Ожидается `"version": "0.7.5"`. Не совпало — стоп, чат агенту.

**КТ2 — состав (перед коммитом):**

```powershell
git status --short
```

Ожидается 27 файлов. Изменённые (`M`, 11):

```
CHANGELOG.md
docs/INVENTORY.md
docs/ROADMAP-DEALFLOW.md
docs/ROADMAP.md
package.json
scripts/e2e_api_test.py
src/app/admin/login/page.tsx
src/components/admin/AdminNav.tsx
src/components/admin/AttentionScreen.tsx
src/components/admin/SideActivityFeed.tsx
src/components/admin/attention/AttentionSections.tsx
```

Новые (`??`/`A`, 16):

```
docs/releases/RELEASE-INSTRUCTIONS-v0.7.5.md
docs/releases/RELEASE-NOTES-v0.7.5.md
docs/releases/SCOPE-v0.7.5.json
scripts/pulse_check.py
src/app/admin/(dashboard)/pulse/page.tsx
src/app/api/admin/pulse/route.ts
src/components/admin/ActivityEventList.tsx
src/components/admin/HiddenMore.tsx
src/components/admin/pulse/PulseCargoBlock.tsx
src/components/admin/pulse/PulseEventsBlock.tsx
src/components/admin/pulse/PulseScreen.tsx
src/components/admin/pulse/PulseSlowingBlock.tsx
src/components/admin/pulse/types.ts
src/hooks/use-api-data.ts
src/lib/pulse.test.ts
src/lib/pulse.ts
```

Расхождение по числу/составу — стоп, чат агенту.

## Шаг 2. Коммит и пуш

```powershell
# Одинарные кавычки PowerShell: внутри НЕ должно быть двойных и
# типографских (« » „ “ ") — урок v0.7.4: сообщение с „В работе“
# при вставке в консоль разорвало строку, git принял куски за пути.
git add -A
git commit -m 'release v0.7.5: DF-07 — Пульс владельца: экран /admin/pulse для мастера (цифры, где груз, кто тормозит, события за сутки), вход мастера открывает Пульс, менеджеру 403'
git log --oneline -2
git push origin main
```

`git log --oneline -2` обязан показать верхним `release v0.7.5: …` — коммит создался. Не показал — стоп, чат агенту.

## Шаг 3. CI

Дождаться зелёного GitHub Actions (checks + integrity + e2e + заморозка). Красный — прислать лог агенту; откат `git revert HEAD --no-edit && git push`.

## Шаг 4. Vercel

Deployments → Ready (env не менялись — redeploy не требуется).

## Шаг 5. Smoke (прод)

1. `/api/health` — `{"status":"ok","db":"ok"}`.
2. Войти мастером с телефона → открывается «Пульс»; в меню (и в мобильной полосе) — первый пункт «Пульс».
3. Цифры: «Активные заявки» = счётчику на «Заявках» (без «Завершена»/«Отменена»); «В пути» = фильтр «В работе».
4. «Кто тормозит»: касание группы раскрывает заявки; переход по заявке работает.
5. «Где груз»: у заявки с этапами — ближайший этап и перевозчик; ETA — самая поздняя план-дата незавершённых.
6. Войти менеджером → пункта «Пульс» в меню нет; прямая ссылка `/admin/pulse` ведёт на главную «Требует внимания».
7. Мобильный (375 px): цифры сеткой 2 колонки, карточки на всю ширину, ничего не выходит за экран.
