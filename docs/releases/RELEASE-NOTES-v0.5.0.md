# Релизные заметки v0.5.0 (P1-22) — 25.10.2026

Задача **P1-22 «Справочники по компоновке §4.3 (после резки монолитов)»**.
Версия minor — веха масштаба P1-19 (0.3.0) и P1-21 (0.4.0).

## Что сделано

### 1. Резка монолитов (RULES 2.14, механическая, без изменения поведения)
Все 14 файлов >300 строк приведены к лимиту — теперь максимум среди
компонентов и роутов **294 строки**:

| Было (строк) | Файл | Стало |
|---|---|---|
| 777 | ContractorLeadsSection | диалоги в `contractorlead/` (7 файлов: Actions/Contract/Create-диалоги, StatusBadge, RawInfoView, TransportChips, types) |
| 688 | EmployeesList | `employee/` (7: Card, Create, Edit, ResetPassword, RoleChips, password, types) |
| 500 | BrokersList | `broker/` (5: Card, Create, Edit, FormFields, types) |
| 496 | ContractorPoolSection | `contractorpool/` (3: Edit, Toggle, types) |
| 491 | DocumentsSection | `documents/parts/` (3: Create, Version, types) |
| 478 | StageCatalogList | `stagecatalog/` (3: Create, Edit, types) |
| 456 | print/page | `PrintTable` + `data.ts` |
| 447 | CargoGroups | `cargo/` (2: FormFields, GroupsView) |
| 402 | api orders/[id] | `patch.ts` + `schemas.ts` |
| 371 | api leads/[id] | `patch.ts` |
| 353 | api leads/[id]/convert | `helpers.ts` |
| 311 | AttentionScreen | `attention/` (2: Sections, types) |
| 309 | ClientHome | `ClientLeadCreateDialog` |
| 478 | LegalEntitiesList | `legalentity/` (5: Card, Create, Edit, RequisitesFields, types) |

Общие части вместо копипасты: **`ListToolbar`** (поиск с крестиком +
сортировка, паттерн Ж4) и **`use-paged-list`** (пагинация hasMore).

### 2. Справочники в анатомии §4.2–4.3 (как клиенты/договоры в P1-21)
- **Брокеры**: шапка §4.2 (заголовок + главное действие Coral), табы-
  фильтры «Действующие / Деактивированные / Все» (ListTabs, без чисел —
  API отдаёт отфильтрованный набор), карточка §4.3-lite (BrokerCard),
  пустые состояния на каждый таб.
- **Сотрудники**: поиск «Имя или телефон…» + сортировка (ListToolbar),
  пагинация (usePagedList), карточка §4.3-lite (EmployeeCard), сброс
  пароля — отдельный диалог (EmployeeResetPasswordDialog).
- **Юрлица**: поиск/сортировка/пагинация, карточка §4.3-lite
  (LegalEntityCard), реквизиты — RequisitesFields.

## Осознанно НЕ менялось
- **Поведение интерфейса и тексты** — резка без рефакторинга логики;
  e2e прошёл без единой правки тестов (149/149).
- **API-контракты и роуты** — split на patch/schemas/helpers
  внутренний, ответы сервера идентичны.
- **`src/lib`** с файлами >300 (documents.ts 537, leads.ts 471,
  orders.ts 367, lead-edit.ts 317) — RULES 2.14 нормирует компоненты и
  роуты; содержательно не трогались.
- Sidebar-счётчики §4.1 (AdminNav), терминология D27 («Запросы»).

## Состав (67 файлов: 19 M + 48 A, без удалений)
- корень: `CHANGELOG.md`, `package.json` (0.5.0) — 2 M;
- `docs/`: `DECISIONS.md` (D28), `ROADMAP.md` — 2 M;
- `docs/releases/`: NOTES + INSTRUCTIONS v0.5.0 — 2 A;
- `src/` — 61 файл: 15 M + 46 A (полный список — КТ2 инструкции).

## Факты приёмки (25.10.2026)
- tsc `--noEmit` — 0 ошибок; eslint — 0; vitest **32/32**;
  `next build` — OK.
- hex вне `globals.css` = 0; emoji в `src/` = 0; компоненты и роуты
  ≤ 300 строк (макс 294 — `api/admin/leads/[id]/patch.ts`).
- e2e `scripts/e2e_api_test.py` — **149/149** на PostgreSQL 16
  (локальный zonky-кластер), `ADMIN_PASSWORD` env, после прогонов —
  `DELETE FROM "LoginAttempt"`.
- agent-browser 1440: главная («Требует внимания»), брокеры (табы
  «Действующие/Деактивированные/Все» переключаются), сотрудники,
  юрлица, подрядчики (пул + секция заявок), этапы, заявка №15-1
  (документы, группы груза), печать — h1 корректны; поиск сотрудников:
  по имени без учёта регистра («мастер» → «Мастер Logix»), по телефону
  («+79992461034» → «Менеджер B ead3f6»), мусорный запрос → «Ничего».
- agent-browser 375: 7 экранов — `scrollWidth − clientWidth = 0`.
- Консоль браузера и page errors — пусто.
- Скриншоты приёмки: `p1-22-brokers-1440/375.png`,
  `p1-22-employees-1440/375.png`, `p1-22-legal-entities-1440.png`,
  `p1-22-contractors-1440.png`, `p1-22-order-docs-1440.png`,
  `p1-22-print-1440.png` (в `download/`).

## Миграции
**Нет.** Схема базы не менялась. Новых env-переменных нет.
