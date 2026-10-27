# Инструкция владельца: деплой v0.6.0 (DF-01 «События как ось») — 27.10.2026

Время: ~10–15 минут (впервые за долгое время — **миграция БД**). Все
команды — готовые блоки для вставки в PowerShell (D20), кроме одного
шага, помеченного «не PowerShell». Выполняйте строго по порядку.

**Что в этом релизе:** новых функций нет — архитектурный фундамент Фазы
DF (журнал событий с аудиторией и связью с этапом/документом). Контракты
API и поведение интерфейса не менялись. **Есть миграция** — additive
(3 колонки + backfill + констрейнт), откат совместим. **Удалений файлов
нет** — шаг `git rm` не требуется.

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
подготовки — релиз v0.5.5; если после него были другие коммиты —
остановитесь и сверьтесь со мной).

## 1. Распаковать архив с заменой

```powershell
Expand-Archive -Path "C:\PROJECTS\logix-v0.6.0.zip" -DestinationPath "C:\PROJECTS\logix" -Force
```

Путь к zip подставьте фактический. `.env` владельца архив не содержит
и не перезатирает.

## 2. Индексация и сверка

```powershell
git add -A
git status --short
```

КТ1: **50 файлов — 40 изменённых (M) и 10 новых (A), удалений 0**.
Изменённые: `package.json`, `.gitignore`, `CHANGELOG.md`, 5 доков
(`docs/DEPRECATIONS.md`, `INVENTORY.md`, `ROADMAP.md`,
`ROADMAP-DEALFLOW.md`, `RULES.md`), `prisma/schema.prisma`, 4 скрипта
(`build-release.py`, `e2e_api_test.py`, `integrity-baseline.json`,
`integrity_check.py`), дашборд `src/app/admin/(dashboard)/page.tsx`,
22 API-роута, `src/lib/activity.ts`, `src/lib/documents.ts`.
Новые: `src/lib/events.ts`, `audience.ts`, `broker-links.ts`,
`events.test.ts`, `audience.test.ts`, `events-guard.test.ts`,
`prisma/migrations/20261026182707_df_01_event_audience/migration.sql`,
`docs/releases/RELEASE-NOTES-v0.6.0.md`,
`docs/releases/RELEASE-INSTRUCTIONS-v0.6.0.md`,
`docs/releases/SCOPE-v0.6.0.json`.
Если строк больше/меньше — **остановитесь** и пришлите вывод
`git status`.

## 3. Миграция прод-базы (Neon)

Клон уже подключён к прод-базе через `.env` (переменная `DATABASE_URL`).
Миграция только добавляет колонки/констрейнт и один раз заполняет
аудиторию в существующих событиях — существующие данные не меняет и
не удаляет.

```powershell
npx prisma@6 migrate deploy
```

- Версия `@6` обязательна: в проекте Prisma 6.x. Без неё скачается
  Prisma 8 (RC), где команда переименована (ошибка CLI.COMMAND_MOVED).
  Совет «prisma db migrate» из её сообщения НЕ применяйте.
- На вопрос npx «Need to install…» — нажмите `y` (разово и безопасно).
- **Ожидается:** `Datasource "db": PostgreSQL database …neon.tech`,
  затем `1 migration found` и `Applying migration
  20261026182707_df_01_event_audience`, в конце
  «Your database is now in sync with your schema».
- Повторный запуск отвечает «No pending migrations to apply» — это
  нормально (идемпотентна). Любая ошибка — стоп, копия вывода мне в чат.

Проверка отсутствия дрейфа схемы:

```powershell
npx prisma@6 migrate diff --from-url "$env:DATABASE_URL" --to-schema-datamodel prisma/schema.prisma
```

КТ2: **вывод пустой** (схема и база синхронны). Если не пустой — стоп,
вывод мне в чат.

## 4. Коммит и пуш

```powershell
git commit -m "release v0.6.0: DF-01 события как ось — emitEvent (единственная точка записи, аудитория из реестра EVENT_TYPES), eventWhereFor (единственная точка видимости), колонки audience[]/stageId/documentId + backfill, охранные тесты, e2e 163"
git push origin main
git log --oneline -1
```

## 5. Проверка CI

Откройте Actions → ждите зелёного по всем 4 job'ам:

- `validate · tsc · lint · build`;
- `integrity (G3/G4 — IC-01..IC-14, knip)`;
- `e2e API (PostgreSQL)` — **163/163** + шаг заморозки 16/16;
- `gitleaks`.

КТ3: все 4 job зелёные. Если что-то красное — пришлите полный лог
упавшего job'а (миграция локальной БД в CI применяется автоматически,
отдельных действий не требует).

## 6. Проверка прода

После автодеплоя Vercel:

```powershell
curl.exe -s https://logix-gamma.vercel.app/api/health
```

КТ4: `{"status":"ok","db":"ok",...}`. Вход мастера работает. Smoke
ленты (1 минута): откройте любую заявку → смените статус → в ленте
событий карточки появилось новое событие; создайте внутреннюю заметку —
она видна сотрудникам, а «Заметка»-бейдж на месте. Клиенту/брокеру
заметка по-прежнему не видна (проверять не обязательно — это покрыто
163 e2e-проверками).

## Откат

Миграция additive: **старый код v0.5.5 работает с новыми колонками**
(игнорирует их), поэтому при проблемах откатываем только код:

```powershell
Expand-Archive -Path "C:\PROJECTS\logix-v0.5.5.zip" -DestinationPath "C:\PROJECTS\logix" -Force
git add -A
git commit -m "rollback to v0.5.5"
git push origin main
```

Миграцию и данные НЕ трогаем. Важно знать: откатнутый v0.5.5 пишет
события со старым набором полей, и CHECK-констрейнт
`activity_audience_nonempty` такие записи отклоняет — старый код это
безопасно глотает (ошибка журнала не валит операции, `console.error`
в логе), но **лента событий перестанет пополняться**. Это сигнал, что
вы на откате; для восстановления ленты верните v0.6.0.
