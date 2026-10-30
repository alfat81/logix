# DEPRECATIONS — реестр временно оставленного (DF-00B, G4 п. 1)

Каждая строка — замена, которая по правилу «замена = удаление в том же релизе»
(RULES 2.3, expand → migrate → contract) не могла быть удалена сразу.

**31.10.2026, v0.7.11 — DF-16:** первая запись после DF-03. Свободный список
`requiredPermits` в ответе брокера (DF-18) превращён в строки `PermitRequirement`
(migration `df_16_permits` — expand + перенос данных); поле осталось на
`BrokerEstimate` до contract-релиза, sync живёт в `permits-db.syncEstimatePermits`.

**28.10.2026, v0.6.5 — реестр пуст.** Все пять записей (созданы v0.6.1–v0.6.2,
версия удаления 0.6.5) доставлены contract-миграцией `df_03_contract` вместе с
DF-03: `logActivity()` (замороженный роут подрядчика переведён на `emitEvent` —
механический перевод, D31 не нарушен), колонка `Activity.isInternal` (единственный
носитель видимости — `audience`, страховка `isInternal:false` в `eventWhereFor`
снята), `ACTIVITY_EXTERNAL_WHERE`, `Customer.password` и `Broker.password`
(вход — только через `CustomerUser`/`BrokerUser` с v0.6.2; зеркала паролей в
access-роутах удалены вместе с колонками). Новых отложенных замен нет.
`@deprecated` в коде без записи здесь — нарушение (IC-12/G4 п. 2).
Запись с версией удаления ≤ текущей и живым кодом — красный CI.

| Что | Чем заменено | Почему оставлено | Версия удаления | Как проверить |
|---|---|---|---|---|
| `BrokerEstimate.requiredPermits` (Json, свободный список названий) | строки `PermitRequirement` (DF-16: `providedBy`, `isBlocking`, `neededBy`, статус, документ) | контракт PUT оценки не ломаем (расчёт DF-18 живой); sync `requiredPermits` → строки работает в обе стороны (добавленные создают pending, исчезнувшие удаляют СВОИ pending без документа) | 0.8.0+ (минимальный ориентир; факт — contract-релиз пакета документов DF-13) | e2e DF-16: оценка с перечнем создаёт строки; `DEPRECATIONS`-гард CI |