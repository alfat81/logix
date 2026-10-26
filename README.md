# Logix

Операционная платформа международной экспедиторской компании:
запросы клиентов → варианты расчёта → заявки с этапами перевозки →
перевозчики и таможенные брокеры → документооборот с версиями.
Четыре кабинета: сотрудники `/admin`, клиенты `/client`,
брокеры `/broker`, перевозчики `/contractor`.

Стек: Next.js 16, React 19, TypeScript strict, Prisma 6 + PostgreSQL (Neon),
Tailwind 4 + shadcn/ui, деплой на Vercel.

## Документы проекта

| Файл | Что в нём |
|---|---|
| `docs/ROADMAP.md` | Аудит, роадмап по фазам, задачи с ID и критериями приёмки |
| `docs/RULES.md` | Правила проекта и готовый промпт для разработчика / ИИ-агента |
| `docs/SECURITY-ACTIONS.md` | Действия владельца после инцидента с секретами |
| `DEPLOY.md` | Деплой на Vercel + Neon, миграции, обновление версии |
| `CHANGELOG.md` | История изменений |
| `docs/archive/` | Старый роадмап v2.0 и журнал сессий (только для справки) |

## Быстрый старт

```bash
bun install
cp .env.example .env          # DATABASE_URL — тестовая база PostgreSQL
bun run db:deploy             # миграции
bun run seed -- --dev         # мастер, каталог этапов, юрлицо-образец
bun run dev                   # http://localhost:3000/admin/login
```

Вход после сида в режиме `--dev`: `+79000000000` / `logix-master`.
Для любой не-локальной базы сид требует `MASTER_PHONE` и `MASTER_PASSWORD`.

## Проверки (то же, что в CI)

```bash
bunx prisma validate && bunx tsc --noEmit && bun run lint && bun run build
# сквозной API-тест — только на тестовой базе, при запущенном bun run start:
ADMIN_PASSWORD=logix-master bun run test:e2e
# гейты G3/G4 (DF-00B): целостность IC-01..IC-14 и неиспользуемое (храповики):
python3 scripts/integrity_check.py && python3 scripts/knip_check.py
# индекс проекта (G1) и контроль области изменений (G2):
python3 scripts/inventory.py && python3 scripts/scope.py init   # снимок до начала задачи
python3 scripts/scope.py check                                   # после: правки вне SCOPE-vX.Y.Z.json = красный
# тесты самих проверок:
python3 scripts/test_integrity.py
```

Схема БД меняется только миграциями: `bun run db:migrate --name <задача>`.
`db:push` — только для одноразовых песочниц.

Замороженные области (кабинет подрядчика, D31) — `docs/FROZEN.md`:
список глобов, правила правок (`unfreeze`) и условие разморозки.
`CONTRACTOR_PORTAL_ENABLED=true` временно включает кабинет (регресс/CI).

## Имя проекта

`logix` — плейсхолдер. При выборе названия заменить в `package.json`,
этом файле и `src/app/layout.tsx`.
