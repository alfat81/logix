# Релизные заметки v0.5.1 (DF-00) — 26.10.2026

Релиз **DF-00 «Фундамент: атомарная конвертация, разграничение прав, гигиена»**.
Первый релиз Фазы DF («Единая картина сделки»).

## Что сделано

### 1. Атомарная конвертация лида в заявку (P1-10)
- `POST /api/admin/leads/[id]/convert`: создание клиента (`findOrCreateCustomer`), создание заявки (`createOrderWithStages`), генерация обязательных этапов, перевод статуса лида в `won`, перенос брокеров (`carryBrokersToOrder`), перенос документов (`carryDocumentsToOrder`) и аудит-логи (`logActivity`) объединены в **одну интерактивную транзакцию** `db.$transaction` с таймаутом 15с (`{ timeout: 15000, maxWait: 5000 }`).
- Параметр `tx` проброшен во все вспомогательные функции: `createOrderWithStages(..., tx)`, `carryBrokersToOrder(..., tx)`, `carryDocumentsToOrder(..., tx)`.
- В `createOrderWithStages`: добавлена блокировка строки контракта (`SELECT id FROM "Contract" WHERE id = ${contract.id} FOR UPDATE`) для предотвращения гонок `numberInContract` без retry-петли на P2002.
- Ветка самовосстановления убрана: транзакция исключает полусконвертированные состояния, повторный вызов отдает 409 `Запрос уже конвертирован в заявку №...`.
- Разгрузка `orders.ts` (368 → 252 строки): функции сводки этапов и расчета ETA вынесены в `src/lib/order-summary.ts` в полном соответствии с лимитом RULES 2.14.

### 2. Разграничение прав ролей (P1-09)
Мастер-онли (`roles: ['master']`):
- `POST /api/admin/stage-catalog`: создание этапов в справочнике.
- `PATCH /api/admin/stage-catalog/[id]`: перестановка и изменение этапов.
- `DELETE /api/admin/stage-catalog/[id]`: удаление необязательных этапов.
- `POST /api/admin/legal-entities`: добавление наших юрлиц.
- `PATCH /api/admin/legal-entities/[id]`: редактирование реквизитов и статуса юрлиц.
- `DELETE /api/admin/leads/[id]`: удаление запросов (только без созданной заявки).
- Возврат из терминальных статусов: `lost`/`won` у лида, `completed`/`cancelled` у заявки.
- Менеджерам возвращается 403 Forbidden.
- Добавлен автоматический аудит-тест `permissions-guard.test.ts`.

### 3. Безопасность и гигиена
- `src/lib/password.ts`: убран фолбэк на открытый текст в `verifyPassword`. Пароли без префикса `scrypt:` отвергаются.
- `scripts/seed.ts` и `.env.example`: удален режим `file:` (SQLite); `--dev` разрешен только при подключении к `localhost` или `127.0.0.1`.
- `docs/SECURITY-ACTIONS.md`: bash-команды переписаны на PowerShell (`$env:DATABASE_URL`, `Read-Host -AsSecureString`).
- CSRF-прокси: подтверждена корректная работа защиты Origin в `src/proxy.ts`.

## Состав изменений
- `package.json` (0.5.1), `CHANGELOG.md`
- `docs/ROADMAP-DEALFLOW.md`, `docs/DECISIONS.md` (D29, D30, D31), `docs/ROADMAP.md`, `docs/RULES.md`, `docs/SECURITY-ACTIONS.md`
- `docs/releases/RELEASE-NOTES-v0.5.1.md`, `docs/releases/RELEASE-INSTRUCTIONS-v0.5.1.md`
- `src/lib/password.ts`, `src/lib/password.test.ts`
- `src/lib/orders.ts`, `src/lib/order-summary.ts`, `src/lib/permissions-guard.test.ts`, `src/lib/convert-atomic.test.ts`
- `src/app/api/admin/leads/[id]/convert/route.ts`, `src/app/api/admin/leads/[id]/convert/helpers.ts`
- `src/app/api/admin/stage-catalog/route.ts`, `src/app/api/admin/stage-catalog/[id]/route.ts`
- `src/app/api/admin/legal-entities/route.ts`, `src/app/api/admin/legal-entities/[id]/route.ts`
- `src/app/api/admin/leads/[id]/route.ts`, `src/app/api/admin/leads/[id]/patch.ts`
- `scripts/seed.ts`, `.env.example`

## Факты приёмки
- Vitest: 6 файлов, **39 тестов** — 100% passed (0 failed).
- ESLint: 0 ошибок.
- Next.js build / compile: 0 ошибок.
- Лимиты файлов: все файлы компонентов и роутов строго ≤ 300 строк.
