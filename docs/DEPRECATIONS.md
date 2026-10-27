# DEPRECATIONS — реестр временно оставленного (DF-00B, G4 п. 1)

Каждая строка — замена, которая по правилу «замена = удаление в том же релизе»
(RULES 2.3, expand → migrate → contract) не могла быть удалена сразу.
`@deprecated` в коде без записи здесь — нарушение (IC-12/G4 п. 2).
Запись с версией удаления ≤ текущей и живым кодом — красный CI.

| Что | Чем заменено | Почему оставлено | Версия удаления | Как проверить |
|---|---|---|---|---|
| `logActivity()` (обёртка, `src/lib/activity.ts`) | `emitEvent()` из `src/lib/events.ts` (аудитория из реестра `EVENT_TYPES`) | Замороженный контур подрядчика (`FROZEN.md`, D31) — роут `src/app/api/contractor/orders/[id]/stages/[stageId]/route.ts` работает через обёртку без правок | 0.6.3 (contract после DF-03) | `rg "logActivity\(" src` — только определение-обёртка и замороженный роут (охранный тест `events-guard.test.ts`) |
| Колонка `Activity.isInternal` | Колонка `Activity.audience` (миграция `df_01_event_audience`); `isInternal` пишется синхронно: `isInternal = (audience == {staff})` | Читатели: проекция ленты `ACTIVITY_PUBLIC_FIELDS` (бейдж «Заметка») и страховка `isInternal: false` в `eventWhereFor` до contract-релиза | 0.6.3 (contract после DF-03, вместе с миграцией удаления) | `rg "isInternal" src` — нет ручных записей мимо `emitEvent`/`logInternalNote`; синхрон покрывается `events.test.ts` |
| `ACTIVITY_EXTERNAL_WHERE` (`src/lib/activity.ts`) | `eventWhereFor(audience)` из `src/lib/audience.ts` (учитывает `audience`, а не только `isInternal`) | Потребителей в коде нет; символ оставлен как реэкспорт-совместимость до contract-релиза | 0.6.3 (contract после DF-03) | `rg "ACTIVITY_EXTERNAL_WHERE" src` — только определение с `@deprecated` |
