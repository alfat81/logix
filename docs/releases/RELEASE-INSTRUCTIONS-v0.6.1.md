# Инструкция владельца: деплой v0.6.1 (DF-00D «Настройки системы») — 27.10.2026

Время: ~10–15 минут. Все команды — готовые блоки для вставки в
PowerShell (D20). Выполняйте строго по порядку.

**Что в этом релизе:** раздел «Настройки» для мастера (17
бизнес-параметров в 7 группах, изменения без выката, каждое — в журнале).
Новых контрактов для кабинетов клиента/брокера нет. **Есть миграция** —
additive (одна новая таблица `Setting`, создаётся пустой). **Удалений
файлов нет** — шаг `git rm` не требуется. Новых переменных окружения
нет — шаг env vars не требуется.

## 0. Привести клон в чистое состояние

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

КТ0: `working tree clean`, HEAD = актуальный `main` (на момент
подготовки — релиз v0.6.0; если после него были другие коммиты —
остановитесь и сверьтесь со мной).

## 1. Распаковать архив с заменой

```powershell
Expand-Archive -Path "C:\PROJECTS\logix-v0.6.1.zip" -DestinationPath "C:\PROJECTS\logix" -Force
```

Путь к zip подставьте фактический. `.env` владельца архив не содержит
и не перезатирает.

## 2. Индексация и сверка

```powershell
git add -A
git status --short
```

КТ1: **26 файлов — 14 изменённых (M) и 12 новых (A), удалений 0**.

Изменённые (14): `CHANGELOG.md`, `package.json`, `prisma/schema.prisma`,
5 доков (`docs/DECISIONS.md`, `docs/INVENTORY.md`, `docs/ROADMAP.md`,
`docs/ROADMAP-DEALFLOW.md` — и CHANGELOG в корне уже назван),
`scripts/e2e_api_test.py`, `scripts/integrity-baseline.json`,
`scripts/integrity_check.py`, `scripts/test_integrity.py`,
`src/components/admin/AdminNav.tsx`, `src/lib/activity.ts`,
`src/lib/events.ts`. Точный список M: `CHANGELOG.md`,
`docs/DECISIONS.md`, `docs/INVENTORY.md`, `docs/ROADMAP-DEALFLOW.md`,
`docs/ROADMAP.md`, `package.json`, `prisma/schema.prisma`,
`scripts/e2e_api_test.py`, `scripts/integrity-baseline.json`,
`scripts/integrity_check.py`, `scripts/test_integrity.py`,
`src/components/admin/AdminNav.tsx`, `src/lib/activity.ts`,
`src/lib/events.ts`.

Новые (12): `docs/design/UXPILOT-BRIEF.md`,
`docs/design/mockups/.gitkeep`,
`docs/releases/RELEASE-INSTRUCTIONS-v0.6.1.md`,
`docs/releases/RELEASE-NOTES-v0.6.1.md`,
`docs/releases/SCOPE-v0.6.1.json`,
`prisma/migrations/20261027094403_df_00d_settings/migration.sql`,
`src/app/admin/(dashboard)/settings/page.tsx`,
`src/app/api/admin/settings/route.ts`,
`src/components/admin/SettingsPanel.tsx`, `src/lib/settings-validators.ts`,
`src/lib/settings.test.ts`, `src/lib/settings.ts`.

Обязательное наличие строк `src/…` и `prisma/migrations/…`. Если строк
больше/меньше — **остановитесь** и пришлите вывод `git status`.

## 3. Миграция прод-базы (Neon)

Клон уже подключён к прод-базе через `.env` (переменная `DATABASE_URL`).
Миграция только создаёт новую таблицу `Setting` — существующие данные и
таблицы не трогаются, таблица остаётся пустой до первого изменения
настройки (это нормальное состояние).

Контрольная точка перед миграцией (урок v0.2.6: deploy только ПОСЛЕ
распаковки архива):

```powershell
Select-String -Path .\package.json -Pattern '"version"'
```

КТ1а: `"version": "0.6.1"`. Не совпало — стоп, чат агенту.

```powershell
npx prisma@6 migrate deploy
```

- Версия `@6` обязательна (проект на Prisma 6; без неё скачается
  Prisma 8 RC с переименованной командой). На вопрос npx «Need to
  install…» — нажмите `y`.
- **Ожидается:** `1 migration found` и `Applying migration
  20261027094403_df_00d_settings`, в конце «Your database is now in
  sync with your schema». Повторный запуск отвечает «No pending
  migrations» — нормально (идемпотентна). Любая ошибка — стоп, копия
  вывода мне в чат.

Проверка отсутствия дрейфа схемы:

```powershell
npx prisma@6 migrate diff --from-url "$env:DATABASE_URL" --to-schema-datamodel prisma/schema.prisma
```

КТ2: **вывод пустой**. Если не пустой — стоп, вывод мне в чат.

## 4. Коммит и пуш

```powershell
git commit -m "release v0.6.1: DF-00D настройки системы — модель Setting + миграция df_00d_settings, реестр SETTINGS (17 ключей, 7 групп) в src/lib/settings.ts, getSetting (кэш <=60с, откат на дефолт), setSetting/resetSetting (валидатор + событие setting_changed в транзакции), экран /admin/settings и API /api/admin/settings (мастер-only), IC-15 включён (0 нарушений), IC-03 выпрямлен (baseline 133->127), vitest 94/94, e2e 175/175"
git push origin main
git log --oneline -1
```

## 5. Проверка CI

Откройте Actions → ждите зелёного по всем 4 job'ам:

- `validate · tsc · lint · build`;
- `integrity (G3/G4 — IC-01..IC-15, knip)`;
- `e2e API (PostgreSQL)` — **175/175** + шаг заморозки 16/16;
- `gitleaks`.

КТ3: все 4 job зелёные. Если что-то красное — пришлите полный лог
упавшего job'а (миграция локальной БД в CI применяется автоматически,
отдельных действий не требует).

## 6. Проверка прода

После автодеплоя Vercel:

```powershell
curl.exe -s https://logix-gamma.vercel.app/api/health
```

КТ4: `{"status":"ok","db":"ok",...}`.

Smoke «Настроек» (2 минуты, под мастером):

1. Войдите мастером — в меню появился пункт «Настройки» (группы:
   Рассылки, Сводка владельцу, Ожидания, Разрешительные документы,
   Файлы, Бренд, Почта).
2. Откройте «Файлы» → «Максимальный размер файла, МБ»: видно
   «По умолчанию: 25». Поменяйте на `50` → «Сохранить» → подсказка
   успеха и подпись «Изменено: …».
3. Нажмите «Сбросить» → значение вернулось к 25.
4. Введите `0` и «Сохранить» → ошибка валидации (границы 1–200),
   значение не сохранилось.
5. Под менеджером (если заведён) пункт «Настройки» отсутствует.

Изменение действует без выката — это и есть критерий приёмки карточки.
Событие `setting_changed` в журнале не видно в UI (глобальные события
без привязки к сделке читает DF-07, «Пульс») — оно покрыто e2e и
интеграционными тестами.

## Откат

Миграция additive (новая пустая таблица): **старый код v0.6.0 работает
с ней без изменений** (он о таблице не знает), поэтому при проблемах
откатываем только код:

```powershell
Expand-Archive -Path "C:\PROJECTS\logix-v0.6.0.zip" -DestinationPath "C:\PROJECTS\logix" -Force
git add -A
git commit -m "rollback to v0.6.0"
git push origin main
```

Миграцию и данные НЕ трогаем. Настройки, изменённые до отката, останутся
в таблице `Setting` и снова подхватятся при возврате на v0.6.1 или
следующих релизах.
