<!-- Автогенерируемый файл (scripts/inventory.py, DF-00B). Руками не править. -->
<!-- Регенерация: python3 scripts/inventory.py; расхождение с кодом ловит IC-12 и CI. -->

# INVENTORY — индекс инструментов проекта

Назначение (гейт G1, docs/ROADMAP-DEALFLOW.md §4.7): перед созданием нового хелпера,
компонента, роута или скрипта проверить здесь и в коде, что аналога ещё нет.
Подробности — docs/RULES.md (2.13 reuse-first).


## Экспорты src/lib

| Экспорт | Файл | Назначение (первая строка комментария) |
|---|---|---|
| `ACTIVITY_EXTERNAL_WHERE` | `src/lib/activity.ts` | Обязательный фрагмент where для ВНЕШНИХ read-контекстов ленты — |
| `ACTIVITY_FEED_TAKE` | `src/lib/activity.ts` | Лимит выдачи: лента без пагинации (Ж4 сделает постраничность для |
| `ACTIVITY_PUBLIC_FIELDS` | `src/lib/activity.ts` | ── Чтение ленты (GET карточек) ───────────────────────────────────── |
| `ACTIVITY_TYPES` | `src/lib/activity.ts` | Стабильные коды событий: расширение списка — правка здесь, значения |
| `ActivityActor` | `src/lib/activity.ts` | Кто действовал. Сотрудник, подрядчик, клиент (И1 — запрос из |
| `ActivityTarget` | `src/lib/activity.ts` | Цель события — ровно одна из трёх. Дискриминированное объединение: |
| `ActivityType` | `src/lib/activity.ts` | — |
| `BROKER_COMPANY_NAME_MAX` | `src/lib/brokers.ts` | Название компании — потолок как у подрядчика (Г2). |
| `BROKER_KIND_LABELS` | `src/lib/brokers.ts` | Пометка «штатный/привлечённый» для списков. |
| `BROKER_PASSWORD_MAX` | `src/lib/brokers.ts` | — |
| `BROKER_PASSWORD_MIN` | `src/lib/brokers.ts` | Пароль урезанного ЛК брокера. Жёстче подрядчицкого (6, Г2 — только |
| `BROKER_PUBLIC_FIELDS` | `src/lib/brokers.ts` | ─── Публичная проекция брокера (Д) ─────────────────────────────── |
| `BROKER_SESSION_COOKIE` | `src/lib/broker-auth.ts` | Кабинет брокера (Д). Механизм сессий — lib/portal-auth.ts. |
| `BrokerActor` | `src/lib/activity.ts` | — |
| `BrokerEstimateInput` | `src/lib/brokers.ts` | — |
| `BrokerEstimateSchema` | `src/lib/brokers.ts` | — |
| `CARGO_PROFILES` | `src/lib/order-constants.ts` | Профиль груза (роадмап, раздел 6: негабарит/опасные — глубже в Phase 2). |
| `CARGO_PROFILE_LABELS` | `src/lib/order-constants.ts` | — |
| `CLIENT_LEAD_DAILY_LIMIT` | `src/lib/client-constants.ts` | Дневной потолок запросов из кабинета на клиента (анти-спам внешнего |
| `CLIENT_PASSWORD_MAX` | `src/lib/client-constants.ts` | — |
| `CLIENT_PASSWORD_MIN` | `src/lib/client-constants.ts` | Пароль доступа в кабинет — те же рамки, что у сотрудников (Ж6в) и |
| `CLIENT_SESSION_COOKIE` | `src/lib/client-auth.ts` | Кабинет клиента (И1). Механизм сессий — lib/portal-auth.ts. |
| `COMPETENCIES_DIRECTIONS_KEY` | `src/lib/contractors.ts` | — |
| `COMPETENCIES_TRANSPORT_KEY` | `src/lib/contractors.ts` | — |
| `CONTRACTOR_LEAD_BADGE_VARIANTS` | `src/lib/status-badges.ts` | Кандидат в подрядчики (Г1): новый — ожидание, на проверке — движение, |
| `CONTRACTOR_LEAD_STATUSES` | `src/lib/contractors.ts` | ─── Статусы кандидата (ContractorLead, Г1/Г2) ────────────────────── |
| `CONTRACTOR_LEAD_STATUS_LABELS` | `src/lib/contractors.ts` | — |
| `CONTRACTOR_PUBLIC_FIELDS` | `src/lib/contractors.ts` | ─── Публичная проекция подрядчика (Г3) ───────────────────────── |
| `CONTRACTOR_RAW_INFO_LABELS` | `src/lib/contractors.ts` | ─── Конвенции Json для UI (Г5) ──────────────────────────────────── |
| `CONTRACTOR_SESSION_COOKIE` | `src/lib/contractor-auth.ts` | Кабинет подрядчика (Г4). Механизм сессий — lib/portal-auth.ts. |
| `CURRENCIES` | `src/lib/money.ts` | — |
| `CURRENCY_LABELS` | `src/lib/money.ts` | — |
| `CURRENCY_SIGNS` | `src/lib/money.ts` | Знаки валют — короткие символы в интерфейсе (Intl style:'currency' |
| `CargoInfoSchema` | `src/lib/leads.ts` | Свободная анкета груза на этапе запроса (груз/вес/объём/откуда-куда). |
| `CargoProfile` | `src/lib/order-constants.ts` | — |
| `ClientAccessInput` | `src/lib/client-constants.ts` | — |
| `ClientAccessSchema` | `src/lib/client-constants.ts` | Тело POST /api/admin/customers/[id]/access — выдать/сменить пароль |
| `ClientActor` | `src/lib/activity.ts` | — |
| `ClientCreateRequestInput` | `src/lib/client-constants.ts` | — |
| `ClientCreateRequestSchema` | `src/lib/client-constants.ts` | Тело POST /api/client/leads — запрос из кабинета. Груз — та же |
| `ClientLeadEditInput` | `src/lib/lead-edit.ts` | — |
| `ClientLeadEditSchema` | `src/lib/lead-edit.ts` | Тело PATCH из кабинета клиента: клиент правит ТОЛЬКО анкету груза |
| `ContractorCompetenciesSchema` | `src/lib/contractors.ts` | Компетенции подрядчика (competencies Json, Г1) — тоже record: виды |
| `ContractorContactInfoSchema` | `src/lib/contractors.ts` | Контактные данные подрядчика (contactInfo Json, Г1) — сырой Json по |
| `ContractorLeadStatus` | `src/lib/contractors.ts` | — |
| `ConvertLeadInput` | `src/lib/leads.ts` | — |
| `ConvertLeadSchema` | `src/lib/leads.ts` | ─── Конвертация лида в заявку (В4) ───────────────────────────────── |
| `CreateBrokerInput` | `src/lib/brokers.ts` | — |
| `CreateBrokerSchema` | `src/lib/brokers.ts` | ─── Создание брокера: POST /api/admin/brokers (Д) ──────────────── |
| `CreateContractorLeadInput` | `src/lib/contractors.ts` | — |
| `CreateContractorLeadSchema` | `src/lib/contractors.ts` | ─── Создание кандидата (POST /api/admin/contractor-leads, Г2) ────── |
| `CreateEmployeeInput` | `src/lib/employees.ts` | — |
| `CreateEmployeeSchema` | `src/lib/employees.ts` | ─── Создание сотрудника (POST /api/admin/employees, Ж6в) ───────── |
| `CreateLeadInput` | `src/lib/leads.ts` | — |
| `CreateLeadSchema` | `src/lib/leads.ts` | — |
| `CreateOrderInput` | `src/lib/orders.ts` | — |
| `CreateQuoteOptionInput` | `src/lib/leads.ts` | — |
| `CreateQuoteOptionSchema` | `src/lib/leads.ts` | — |
| `CurrencyCode` | `src/lib/money.ts` | — |
| `CurrentBroker` | `src/lib/broker-auth.ts` | — |
| `CurrentClient` | `src/lib/client-auth.ts` | — |
| `CurrentContractor` | `src/lib/contractor-auth.ts` | — |
| `CurrentEmployee` | `src/lib/auth.ts` | — |
| `DB_OUT_OF_SYNC_HINT` | `src/lib/api-errors.ts` | — |
| `DEFAULT_LIST_TAKE` | `src/lib/list-query.ts` | — |
| `DOCUMENT_TYPES` | `src/lib/document-constants.ts` | — |
| `DOCUMENT_TYPE_LABELS` | `src/lib/document-constants.ts` | — |
| `DOC_ALLOWED_MIME` | `src/lib/document-constants.ts` | Белый список MIME: всё, что реально ходит в логистическом контуре — |
| `DOC_COMMENT_MAX_LENGTH` | `src/lib/document-constants.ts` | — |
| `DOC_FILE_MAX_BYTES` | `src/lib/document-constants.ts` | ── Лимиты загрузки ───────────────────────────────────────────────── |
| `DOC_INLINE_MIME` | `src/lib/document-constants.ts` | MIME, которые можно отдавать inline (безопасны для рендера браузером |
| `DOC_PUBLIC_FIELDS` | `src/lib/documents.ts` | — |
| `DOC_SIGNATURE_ERROR` | `src/lib/documents.ts` | — |
| `DOC_TITLE_MAX_LENGTH` | `src/lib/document-constants.ts` | Пределы текстовых полей: название документа и комментарий версии. |
| `DOC_VERSION_PUBLIC_FIELDS` | `src/lib/documents.ts` | — |
| `DocActor` | `src/lib/documents.ts` | — |
| `DocAllowedMime` | `src/lib/document-constants.ts` | — |
| `DocFilePayload` | `src/lib/documents.ts` | — |
| `DocumentDealTarget` | `src/lib/documents.ts` | — |
| `DocumentMetaInput` | `src/lib/documents.ts` | — |
| `DocumentMetaSchema` | `src/lib/documents.ts` | — |
| `DocumentRow` | `src/lib/documents.ts` | — |
| `DocumentType` | `src/lib/document-constants.ts` | — |
| `DocumentVersionMetaSchema` | `src/lib/documents.ts` | — |
| `DocumentVersionRow` | `src/lib/documents.ts` | — |
| `EMPLOYEE_NAME_MAX` | `src/lib/employees.ts` | Имя для карточки справочника. |
| `EMPLOYEE_PASSWORD_MAX` | `src/lib/employees.ts` | — |
| `EMPLOYEE_PASSWORD_MIN` | `src/lib/employees.ts` | Стартовый/новый пароль сотрудника. Жёстче подрядчицкого (6, Г2 — |
| `EMPLOYEE_PUBLIC_FIELDS` | `src/lib/employees.ts` | ─── Публичная проекция сотрудника (Ж6в) ────────────────────────── |
| `EMPLOYEE_ROLES` | `src/lib/employees.ts` | Роли сотрудников. Employee.roles в БД — JSON-строка ("["master"]"), |
| `EMPLOYEE_ROLE_LABELS` | `src/lib/employees.ts` | — |
| `EMPTY_LEAD_CARGO_FORM` | `src/lib/leads.ts` | — |
| `ESTIMATE_NOTES_MAX` | `src/lib/brokers.ts` | — |
| `EmployeeActor` | `src/lib/activity.ts` | Конкретные типы актёров (Е: документы требуют ровно один из трёх |
| `EmployeeRole` | `src/lib/auth.ts` | Роли — JSON-массив в Employee.roles (не enum БД): новая роль — правка |
| `EmployeeRoleName` | `src/lib/employees.ts` | — |
| `LEAD_ACTIVE_STATUSES` | `src/lib/leads.ts` | v0.3.1 (BRANDBOOK §4.1): счётчик навигации у «Лидов» — активные, |
| `LEAD_BADGE_VARIANTS` | `src/lib/status-badges.ts` | Лид: new/calculated — ждём (расчёт, выбор клиента), won — сделка |
| `LEAD_CARGO_LABELS` | `src/lib/leads.ts` | Подписи полей анкеты — общие для диалога создания и карточки лида |
| `LEAD_SOURCES` | `src/lib/leads.ts` | Источник лида (И1): 'manual' — создан менеджером (В2, дефолт схемы), |
| `LEAD_SOURCE_LABELS` | `src/lib/leads.ts` | — |
| `LEAD_STATUSES` | `src/lib/leads.ts` | Статус лида (роадмап, разделы 2 и 8.1): верхнеуровневый статус воронки |
| `LEAD_STATUS_LABELS` | `src/lib/leads.ts` | — |
| `LEAD_TRANSITIONS` | `src/lib/status-machine.ts` | ─── Лид: Новый → Рассчитан → Выигран / Отказ ───────────────── |
| `LeadCargoData` | `src/lib/leads.ts` | Типизированное чтение cargoInfo в карточке: лиды со старой или |
| `LeadCargoForm` | `src/lib/leads.ts` | Состояние формы анкеты в UI: все поля — строки (числа парсятся при |
| `LeadCargoPayload` | `src/lib/leads.ts` | Сборка тела POST/PATCH из формы: маршрут/метрики уходят в route |
| `LeadEditInput` | `src/lib/lead-edit.ts` | — |
| `LeadEditSchema` | `src/lib/lead-edit.ts` | Тело PATCH анкеты — админский роут (контакты + груз; контакты правятся |
| `LeadSource` | `src/lib/leads.ts` | — |
| `LeadStatus` | `src/lib/leads.ts` | — |
| `LoginKind` | `src/lib/login-guard.ts` | — |
| `MAX_LIST_TAKE` | `src/lib/list-query.ts` | — |
| `MAX_QUERY_LENGTH` | `src/lib/list-query.ts` | — |
| `MIN_QUERY_LENGTH` | `src/lib/search-constants.ts` | Меньше 2 символов роут не ищет (200 с пустыми секциями): одиночная |
| `MockTable` | `src/lib/mock-db.ts` | — |
| `NOTE_MAX_LENGTH` | `src/lib/note-constants.ts` | Потолок текста заметки: лента остаётся читаемой, textarea UI |
| `NoteRow` | `src/lib/activity.ts` | Запись заметки. В отличие от logActivity (наблюдение над действием — |
| `ORDER_ACTIVE_STATUSES` | `src/lib/order-constants.ts` | v0.3.1 (BRANDBOOK §4.2): табы-группы списка заявок. «Активные» — |
| `ORDER_BADGE_VARIANTS` | `src/lib/status-badges.ts` | Заявка: расчёт и согласование — ожидание, в работе — движение, |
| `ORDER_SORTS` | `src/lib/orders.ts` | ─── Сортировки списка заявок (Ж4; v0.3.1 — переезд из роута, ────── |
| `ORDER_STATUSES` | `src/lib/order-constants.ts` | Верхнеуровневый статус заявки — ручной, менеджер переводит осознанно |
| `ORDER_STATUS_LABELS` | `src/lib/order-constants.ts` | — |
| `ORDER_TRANSITIONS` | `src/lib/status-machine.ts` | ─── Заявка: Расчёт → Согласование → В работе → Завершена ───── |
| `OrderStagesSummary` | `src/lib/order-summary.ts` | — |
| `OrderStatus` | `src/lib/order-constants.ts` | — |
| `PERMIT_MAX_COUNT` | `src/lib/brokers.ts` | ─── Оценка таможенных платежей (BrokerEstimate, роадмап 5а) ────── |
| `PERMIT_MAX_LENGTH` | `src/lib/brokers.ts` | — |
| `ParsedDocumentForm` | `src/lib/documents.ts` | — |
| `ParsedListQuery` | `src/lib/list-query.ts` | — |
| `ParsedVersionForm` | `src/lib/documents.ts` | — |
| `PatchBrokerInput` | `src/lib/brokers.ts` | — |
| `PatchBrokerSchema` | `src/lib/brokers.ts` | ─── PATCH брокера: /api/admin/brokers/[id] (Д) ─────────────────── |
| `PatchContractorInput` | `src/lib/contractors.ts` | — |
| `PatchContractorLeadInput` | `src/lib/contractors.ts` | — |
| `PatchContractorLeadSchema` | `src/lib/contractors.ts` | ─── PATCH кандидата: смена статуса / рождение подрядчика ─────────── |
| `PatchContractorSchema` | `src/lib/contractors.ts` | ─── PATCH подрядчика пула: /api/admin/contractors/[id] (Г3) ───── |
| `PatchEmployeeInput` | `src/lib/employees.ts` | — |
| `PatchEmployeeSchema` | `src/lib/employees.ts` | ─── PATCH сотрудника: /api/admin/employees/[id] (Ж6в) ──────────── |
| `PatchLeadInput` | `src/lib/leads.ts` | — |
| `PatchLeadSchema` | `src/lib/leads.ts` | PATCH лида — смена статуса (+ причина при отказе), ответственного |
| `PortalRequireResult` | `src/lib/portal-auth.ts` | — |
| `QUOTE_PRIORITY_FITS` | `src/lib/leads.ts` | Ориентир варианта: под какой приоритет клиента этот вариант заточен |
| `QUOTE_PRIORITY_FIT_LABELS` | `src/lib/leads.ts` | — |
| `QuotePriorityFit` | `src/lib/leads.ts` | — |
| `QuoteSnapshotInput` | `src/lib/leads.ts` | — |
| `QuoteSnapshotSchema` | `src/lib/leads.ts` | ─── Снимок условий сделки (Ж1) ───────────────────────────────────── |
| `REQUISITE_FIELDS` | `src/lib/requisite-fields.ts` | — |
| `RawContact` | `src/lib/leads.ts` | — |
| `RawContactSchema` | `src/lib/leads.ts` | Черновая анкета контакта на этапе запроса (В1, rawContact Json). |
| `RawContractorInfoSchema` | `src/lib/contractors.ts` | Черновая анкета кандидата (rawInfo Json, Г1) — толерантный record, как |
| `RecordItem` | `src/lib/mock-db.ts` | — |
| `RequisiteField` | `src/lib/requisite-fields.ts` | — |
| `RouteFieldsInput` | `src/lib/route-fields.ts` | — |
| `RouteFieldsSchema` | `src/lib/route-fields.ts` | ── zod-схема route-полей (тела POST/PATCH) ───────────────────────── |
| `SEARCH_TAKE` | `src/lib/search-constants.ts` | Сколько строк на секцию (заявки / лиды) возвращает глобальный поиск. |
| `SESSION_COOKIE` | `src/lib/auth.ts` | — |
| `STAGE_BADGE_VARIANTS` | `src/lib/status-badges.ts` | Этап: не начат — нейтрально, в работе — движение, готов — успех, |
| `STAGE_STATUSES` | `src/lib/order-constants.ts` | Статус этапа внутри заявки (роадмап, раздел 3): не начат → в работе → |
| `STAGE_STATUS_LABELS` | `src/lib/order-constants.ts` | — |
| `SYSTEM_ACTOR` | `src/lib/activity.ts` | — |
| `SYSTEM_ACTOR_NAME` | `src/lib/activity.ts` | — |
| `StageStatus` | `src/lib/order-constants.ts` | — |
| `StageView` | `src/lib/order-summary.ts` | — |
| `StageViewRow` | `src/lib/order-summary.ts` | — |
| `StatusBadgeVariant` | `src/lib/status-badges.ts` | — |
| `TERMINAL_ORDER_STATUSES` | `src/lib/status-machine.ts` | Терминальные статусы заявки: переход «из них» — только мастеру |
| `TRANSPORT_FORM_TO_CODE` | `src/lib/route-fields.ts` | Форма бланка хранит русские подписи (TRANSPORT_TYPES); на колонки |
| `TRANSPORT_TYPES` | `src/lib/leads.ts` | Тип перевозки (бланк, п.3). Значения — русские строки: Json груза |
| `TRANSPORT_TYPE_CODES` | `src/lib/route-fields.ts` | Стабильные коды колонок (Prisma enum TransportType). Русские подписи |
| `TRANSPORT_TYPE_LABELS` | `src/lib/route-fields.ts` | — |
| `TransitionOption` | `src/lib/status-machine.ts` | ─── Проекции для UI (P1-05: показываем только допустимое) ──── |
| `TransitionResult` | `src/lib/status-machine.ts` | — |
| `TransportModesSchema` | `src/lib/leads.ts` | Виды транспорта в варианте — свободный список непустых строк («Авто», |
| `TransportType` | `src/lib/leads.ts` | — |
| `TransportTypeCode` | `src/lib/route-fields.ts` | — |
| `UpdateQuoteOptionInput` | `src/lib/leads.ts` | — |
| `UpdateQuoteOptionSchema` | `src/lib/leads.ts` | PATCH варианта: любое подмножество полей, но не пустое. Инвариант |
| `VAT_MODES` | `src/lib/money.ts` | Режим НДС — метка цены, НЕ расчёт (см. enum VatMode в схеме). |
| `VAT_MODE_LABELS` | `src/lib/money.ts` | — |
| `VatModeCode` | `src/lib/money.ts` | — |
| `VisibleDocument` | `src/lib/documents.ts` | — |
| `addDocumentVersion` | `src/lib/documents.ts` | — |
| `allowedLeadTransitionsLabeled` | `src/lib/status-machine.ts` | — |
| `allowedOrderTransitionsLabeled` | `src/lib/status-machine.ts` | — |
| `apiErrorResponse` | `src/lib/api-errors.ts` | — |
| `brokerActor` | `src/lib/activity.ts` | Брокер портала (Д): имя — companyName на момент действия (снимок, |
| `brokerSessionCookieOptions` | `src/lib/broker-auth.ts` | — |
| `buildLeadEditDiff` | `src/lib/lead-edit.ts` | Diff анкеты: список строк «Подпись: старое → новое» (только реально |
| `buildLeadPayload` | `src/lib/leads.ts` | — |
| `calcOrderEta` | `src/lib/order-summary.ts` | v0.3.1 (BRANDBOOK §4.3): ETA заявки — обещанная дата завершения. |
| `cargoFormFromData` | `src/lib/leads.ts` | Обратный разбор в состояние формы (Ж1: правка груза ЗАЯВКИ, правка |
| `carryDocumentsToOrder` | `src/lib/documents.ts` | ── Перенос при конвертации (В4): лид → заявка ────────────────────── |
| `checkLeadTransition` | `src/lib/status-machine.ts` | — |
| `checkLoginGuard` | `src/lib/login-guard.ts` | — |
| `checkOrderTransition` | `src/lib/status-machine.ts` | — |
| `ciContains` | `src/lib/list-query.ts` | Тип — надстройка над Prisma StringFilter: в postgres-генерации клиент |
| `clientActor` | `src/lib/activity.ts` | Клиент кабинета (И1): имя — Customer.name на момент действия |
| `clientSessionCookieOptions` | `src/lib/client-auth.ts` | — |
| `cn` | `src/lib/utils.ts` | — |
| `contractorActor` | `src/lib/activity.ts` | У подрядчика «имя» — companyName (люди не заведены, Г4). |
| `contractorSessionCookieOptions` | `src/lib/contractor-auth.ts` | — |
| `createBrokerSession` | `src/lib/broker-auth.ts` | — |
| `createClientSession` | `src/lib/client-auth.ts` | — |
| `createContractorSession` | `src/lib/contractor-auth.ts` | — |
| `createDocumentOnDeal` | `src/lib/documents.ts` | — |
| `createEmployeeSession` | `src/lib/auth.ts` | — |
| `createMockDb` | `src/lib/mock-db.ts` | Build proxy db object |
| `createOrderWithStages` | `src/lib/orders.ts` | — |
| `db` | `src/lib/db.ts` | — |
| `definePortal` | `src/lib/portal-auth.ts` | — |
| `deleteDocument` | `src/lib/documents.ts` | ── Удаление документа (только менеджер) ──────────────────────────── |
| `destroyBrokerSession` | `src/lib/broker-auth.ts` | — |
| `destroyClientSession` | `src/lib/client-auth.ts` | — |
| `destroyContractorSession` | `src/lib/contractor-auth.ts` | — |
| `destroySession` | `src/lib/auth.ts` | — |
| `detectFamily` | `src/lib/file-signature.ts` | — |
| `docFileError` | `src/lib/documents.ts` | — |
| `documentVisibleToBroker` | `src/lib/documents.ts` | — |
| `documentVisibleToClient` | `src/lib/documents.ts` | — |
| `employeeActor` | `src/lib/activity.ts` | — |
| `findOrCreateContract` | `src/lib/orders.ts` | Для новой пары рамочный договор создаётся прозрачно в момент первой |
| `findOrCreateCustomer` | `src/lib/orders.ts` | Если передан customerId — берём его. Иначе: по телефону (если указан) |
| `fmtDiffNum` | `src/lib/lead-edit.ts` | ── Форматирование значений для diff ──────────────────────────────── |
| `fmtDuty` | `src/lib/brokers.ts` | Строка «₽ / не указана» для UI обеих сторон (админка и портал). |
| `fmtRuDate` | `src/lib/activity.ts` | Дата для описаний событий: дд.мм.гггг по UTC. Плановые даты этапов |
| `formBool` | `src/lib/documents.ts` | Чекбокс из FormData: значения — строки 'true'/'on' либо отсутствие. |
| `formatDocSize` | `src/lib/document-constants.ts` | Человекочитаемый размер для списков (общий для трёх кабинетов). |
| `formatMoney` | `src/lib/money.ts` | «1 450 ₽» | «1 450,50 $» — детерминированный вывод для UI, ленты и |
| `formatMoneyWithVat` | `src/lib/money.ts` | Строка «1 450 ₽ · без НДС» — цена варианта/снимка с режимом НДС. |
| `formatPhoneInput` | `src/lib/phone.ts` | Маска телефона при вводе — форматирует по мере печатания |
| `getBrokerByToken` | `src/lib/broker-auth.ts` | — |
| `getClientByToken` | `src/lib/client-auth.ts` | — |
| `getClientIp` | `src/lib/login-guard.ts` | Доверенный IP клиента. |
| `getContractorByToken` | `src/lib/contractor-auth.ts` | — |
| `getCurrentBroker` | `src/lib/broker-auth.ts` | — |
| `getCurrentClient` | `src/lib/client-auth.ts` | — |
| `getCurrentContractor` | `src/lib/contractor-auth.ts` | — |
| `getCurrentEmployee` | `src/lib/auth.ts` | — |
| `getEmployeeByToken` | `src/lib/auth.ts` | — |
| `getIncompleteMandatoryStages` | `src/lib/orders.ts` | ─── Готовность обязательного ядра к завершению заявки (P1-05) ── |
| `hashPassword` | `src/lib/password.ts` | — |
| `hashSessionToken` | `src/lib/portal-auth.ts` | — |
| `isCurrencyCode` | `src/lib/money.ts` | — |
| `isEmail` | `src/lib/phone.ts` | Проверка: это email? |
| `isLeadAnketaEditable` | `src/lib/lead-edit.ts` | Окно правки анкеты (P1-02): new/calculated. won — история (правится |
| `isPhoneNormalized` | `src/lib/phone.ts` | Проверка: это нормализованный телефон? (+7XXXXXXXXXX) |
| `isSqliteDatabase` | `src/lib/list-query.ts` | — |
| `isStageMandatory` | `src/lib/orders.ts` | — |
| `isValidEmail` | `src/lib/phone.ts` | Проверка: это email (строгая)? |
| `isVatMode` | `src/lib/money.ts` | — |
| `joinRouteText` | `src/lib/route-fields.ts` | Обратная сборка для показа/редактирования: «Страна, город» / «Город» / |
| `logActivity` | `src/lib/activity.ts` | ── Запись события ────────────────────────────────────────────────── |
| `logDocumentVersionAdded` | `src/lib/documents.ts` | Событие о новой версии — отдельно от транзакции (лента — наблюдение, |
| `logInternalNote` | `src/lib/activity.ts` | — |
| `mergeLeadCargo` | `src/lib/lead-edit.ts` | Полная замена известных полей анкеты груза с сохранением неизвестных |
| `mergeTransportChips` | `src/lib/contractors.ts` | Слияние при записи чипов компетенций: менеджер переключает только |
| `moneyAmount` | `src/lib/money.ts` | ─── zod-помощник для денежных полей API (P1-04) ─────────────────── |
| `normalizePhone` | `src/lib/phone.ts` | Нормализация телефона в формат +7XXXXXXXXXX |
| `orderOrderBy` | `src/lib/orders.ts` | — |
| `parseDocumentCreateForm` | `src/lib/documents.ts` | — |
| `parseDocumentVersionForm` | `src/lib/documents.ts` | — |
| `parseEmployeeRoles` | `src/lib/employees.ts` | Безопасный разбор Employee.roles: битый JSON не должен ронять роуты |
| `parseListQuery` | `src/lib/list-query.ts` | Парсинг параметров списка. Возвращает ошибку (строкой — роут отдаст |
| `parseMoneyInput` | `src/lib/money.ts` | Разбор ввода менеджера: «1 450,50» / «1450.5» / «1 450» → число; |
| `parseRouteText` | `src/lib/route-fields.ts` | ── Разбор свободного «Страна, город» ─────────────────────────────── |
| `phoneVariants` | `src/lib/phone.ts` | Телефонные варианты поискового запроса (Ж7, переиспользован Ж6а). |
| `readApiResponse` | `src/lib/api-client.ts` | — |
| `readDocFile` | `src/lib/documents.ts` | Читает файл и проверяет сигнатуру. null — содержимое не прошло проверку. */ |
| `readInfoString` | `src/lib/contractors.ts` | Толерантное чтение строковых полей анкеты (directions и пр.). |
| `readLeadCargo` | `src/lib/leads.ts` | — |
| `readPermits` | `src/lib/brokers.ts` | ─── Конвенции Json для UI (по образцу mergeTransportChips Г5) ──── |
| `readTransportChips` | `src/lib/contractors.ts` | Толерантное чтение массива видов транспорта: не массив / не строки — |
| `readyDateInput` | `src/lib/route-fields.ts` | Готовность к отгрузке: строка yyyy-mm-dd → UTC-полночь (даты бланка — |
| `recordLoginAttempt` | `src/lib/login-guard.ts` | — |
| `requireBroker` | `src/lib/broker-auth.ts` | Единственный способ проверить брокера в роутах кабинета; опций нет — |
| `requireClient` | `src/lib/client-auth.ts` | Единственный способ проверить клиента в роутах кабинета; опций нет — |
| `requireContractor` | `src/lib/contractor-auth.ts` | Единственный способ проверить подрядчика в роутах кабинета; опций нет — |
| `requireEmployee` | `src/lib/auth.ts` | — |
| `requisitesInn` | `src/lib/requisite-fields.ts` | ИНН — главный реквизит для строки списка (идентифицирует юрлицо |
| `resolveFileMime` | `src/lib/file-signature.ts` | — |
| `routeToDbColumns` | `src/lib/route-fields.ts` | RouteFieldsInput → данные для prisma create/update (readyDate — Date, |
| `sanitizeFileName` | `src/lib/documents.ts` | Санитизация имени: без каталогов, без управляющих символов, без |
| `seedMockDatabase` | `src/lib/mock-db.ts` | Seed initial database |
| `sessionCookieOptions` | `src/lib/auth.ts` | — |
| `stageVisual` | `src/lib/stage-visuals.ts` | — |
| `summarizeOrderStages` | `src/lib/order-summary.ts` | Этапы заявки (по sequence asc) → сводка: первый незавершённый этап |
| `tables` | `src/lib/mock-db.ts` | Global registry of mock tables |
| `todayUtcMidnight` | `src/lib/order-summary.ts` | Граница «сегодня» по UTC: плановые даты приходят UTC-полуночью |
| `unauthorized` | `src/lib/portal-auth.ts` | — |
| `utcDayStart` | `src/lib/order-summary.ts` | — |
| `verifyPassword` | `src/lib/password.ts` | — |

## Компоненты

### src/components/admin

| Компонент | Файл |
|---|---|
| `ActivityFeed` | `src/components/admin/ActivityFeed.tsx` |
| `AdminNav` | `src/components/admin/AdminNav.tsx` |
| `AssigneeField` | `src/components/admin/AssigneeField.tsx` |
| `AttentionScreen` | `src/components/admin/AttentionScreen.tsx` |
| `Breadcrumbs` | `src/components/admin/Breadcrumbs.tsx` |
| `BrokerLinksSection` | `src/components/admin/BrokerLinksSection.tsx` |
| `BrokersList` | `src/components/admin/BrokersList.tsx` |
| `CargoFormFields` | `src/components/admin/cargo/CargoFormFields.tsx` |
| `CargoGroups` | `src/components/admin/CargoGroups.tsx` |
| `CargoGroups` | `src/components/admin/cargo/CargoGroupsView.tsx` |
| `ContractorLeadActionsDialog` | `src/components/admin/contractorlead/ContractorLeadActionsDialog.tsx` |
| `ContractorLeadContractDialog` | `src/components/admin/contractorlead/ContractorLeadContractDialog.tsx` |
| `ContractorLeadCreateDialog` | `src/components/admin/contractorlead/ContractorLeadCreateDialog.tsx` |
| `ContractorLeadStatusBadge` | `src/components/admin/contractorlead/ContractorLeadStatusBadge.tsx` |
| `ContractorLeadsSection` | `src/components/admin/ContractorLeadsSection.tsx` |
| `ContractorPoolEditDialog` | `src/components/admin/contractorpool/ContractorPoolEditDialog.tsx` |
| `ContractorPoolSection` | `src/components/admin/ContractorPoolSection.tsx` |
| `ContractorPoolToggleDialog` | `src/components/admin/contractorpool/ContractorPoolToggleDialog.tsx` |
| `ContractsList` | `src/components/admin/ContractsList.tsx` |
| `CustomerCabinetAccess` | `src/components/admin/CustomerCabinetAccess.tsx` |
| `CustomerCard` | `src/components/admin/CustomerCard.tsx` |
| `CustomerCreateDialog` | `src/components/admin/CustomerCreateDialog.tsx` |
| `CustomersList` | `src/components/admin/CustomersList.tsx` |
| `EMPTY_OPTION_FORM` | `src/components/admin/QuoteOptionFormFields.tsx` |
| `EmployeeCard` | `src/components/admin/employee/EmployeeCard.tsx` |
| `EmployeeCreateDialog` | `src/components/admin/employee/EmployeeCreateDialog.tsx` |
| `EmployeeEditDialog` | `src/components/admin/employee/EmployeeEditDialog.tsx` |
| `EmployeeResetPasswordDialog` | `src/components/admin/employee/EmployeeResetPasswordDialog.tsx` |
| `EmployeesList` | `src/components/admin/EmployeesList.tsx` |
| `GlobalSearch` | `src/components/admin/GlobalSearch.tsx` |
| `InfoField` | `src/components/admin/InfoField.tsx` |
| `LeadAnketaCard` | `src/components/admin/lead/LeadAnketaCard.tsx` |
| `LeadCard` | `src/components/admin/LeadCard.tsx` |
| `LeadConvertBlock` | `src/components/admin/lead/LeadConvertBlock.tsx` |
| `LeadCreateDialog` | `src/components/admin/LeadCreateDialog.tsx` |
| `LeadEditDialog` | `src/components/admin/LeadEditDialog.tsx` |
| `LeadListCard` | `src/components/admin/LeadListCard.tsx` |
| `LeadStatusBadge` | `src/components/admin/LeadStatusBadge.tsx` |
| `LeadStatusControls` | `src/components/admin/lead/LeadStatusControls.tsx` |
| `LeadsList` | `src/components/admin/LeadsList.tsx` |
| `LeadsToolbar` | `src/components/admin/LeadsToolbar.tsx` |
| `LegalEntitiesList` | `src/components/admin/LegalEntitiesList.tsx` |
| `LegalEntityCard` | `src/components/admin/legalentity/LegalEntityCard.tsx` |
| `LegalEntityCreateDialog` | `src/components/admin/legalentity/LegalEntityCreateDialog.tsx` |
| `LegalEntityEditDialog` | `src/components/admin/legalentity/LegalEntityEditDialog.tsx` |
| `ListTabs` | `src/components/admin/ListTabs.tsx` |
| `ListToolbar` | `src/components/admin/ListToolbar.tsx` |
| `LogoutButton` | `src/components/admin/LogoutButton.tsx` |
| `NoteForm` | `src/components/admin/NoteForm.tsx` |
| `OrderCard` | `src/components/admin/OrderCard.tsx` |
| `OrderCargoCard` | `src/components/admin/order/OrderCargoCard.tsx` |
| `OrderCreateDialog` | `src/components/admin/OrderCreateDialog.tsx` |
| `OrderPrintToolbar` | `src/components/admin/OrderPrintToolbar.tsx` |
| `OrderQuoteCard` | `src/components/admin/order/OrderQuoteCard.tsx` |
| `OrderQuoteDialog` | `src/components/admin/order/OrderQuoteDialog.tsx` |
| `OrderStages` | `src/components/admin/order/OrderStages.tsx` |
| `OrderStatusBadge` | `src/components/admin/OrderStatusBadge.tsx` |
| `OrderStepper` | `src/components/admin/OrderStepper.tsx` |
| `OrdersList` | `src/components/admin/OrdersList.tsx` |
| `OrdersToolbar` | `src/components/admin/OrdersToolbar.tsx` |
| `QuoteOptionDialog` | `src/components/admin/QuoteOptionDialog.tsx` |
| `QuoteOptionsSection` | `src/components/admin/QuoteOptionsSection.tsx` |
| `RawInfoView` | `src/components/admin/contractorlead/RawInfoView.tsx` |
| `RequisitesFields` | `src/components/admin/legalentity/RequisitesFields.tsx` |
| `RoleChips` | `src/components/admin/employee/RoleChips.tsx` |
| `SideActivityFeed` | `src/components/admin/SideActivityFeed.tsx` |
| `StageCard` | `src/components/admin/order/StageCard.tsx` |
| `StageCatalogList` | `src/components/admin/StageCatalogList.tsx` |
| `StageCreateDialog` | `src/components/admin/stagecatalog/StageCreateDialog.tsx` |
| `StageEditDialog` | `src/components/admin/stagecatalog/StageEditDialog.tsx` |
| `StageSection` | `src/components/admin/attention/AttentionSections.tsx` |
| `TransportChips` | `src/components/admin/contractorlead/TransportChips.tsx` |

### src/components/broker

| Компонент | Файл |
|---|---|
| `BrokerCard` | `src/components/admin/broker/BrokerCard.tsx` |
| `BrokerCreateDialog` | `src/components/admin/broker/BrokerCreateDialog.tsx` |
| `BrokerEditDialog` | `src/components/admin/broker/BrokerEditDialog.tsx` |
| `BrokerEstimateForm` | `src/components/broker/BrokerEstimateForm.tsx` |
| `BrokerFormFields` | `src/components/admin/broker/BrokerFormFields.tsx` |
| `BrokerHome` | `src/components/broker/BrokerHome.tsx` |
| `BrokerLeadCard` | `src/components/broker/BrokerLeadCard.tsx` |
| `BrokerLogoutButton` | `src/components/broker/BrokerLogoutButton.tsx` |
| `BrokerOrderCard` | `src/components/broker/BrokerOrderCard.tsx` |
| `BrokerOrderStatusBadge` | `src/components/broker/BrokerBadges.tsx` |

### src/components/client

| Компонент | Файл |
|---|---|
| `ClientHome` | `src/components/client/ClientHome.tsx` |
| `ClientLeadCard` | `src/components/client/ClientLeadCard.tsx` |
| `ClientLeadCreateDialog` | `src/components/client/ClientLeadCreateDialog.tsx` |
| `ClientLogoutButton` | `src/components/client/ClientLogoutButton.tsx` |
| `ClientOrderCard` | `src/components/client/ClientOrderCard.tsx` |
| `ClientOrderStatusBadge` | `src/components/client/ClientBadges.tsx` |

### src/components/contractor

| Компонент | Файл |
|---|---|
| `ContractorLogoutButton` | `src/components/contractor/ContractorLogoutButton.tsx` |
| `ContractorOrderCard` | `src/components/contractor/ContractorOrderCard.tsx` |
| `ContractorOrdersList` | `src/components/contractor/ContractorOrdersList.tsx` |

### src/components/documents

| Компонент | Файл |
|---|---|
| `DocumentCreateDialog` | `src/components/documents/parts/DocumentCreateDialog.tsx` |
| `DocumentVersionDialog` | `src/components/documents/parts/DocumentVersionDialog.tsx` |
| `DocumentsSection` | `src/components/documents/DocumentsSection.tsx` |

### src/components/ui

| Компонент | Файл |
|---|---|
| `Toaster` | `src/components/ui/toaster.tsx` |
| `badge` | `src/components/ui/badge.tsx` |
| `button` | `src/components/ui/button.tsx` |
| `card` | `src/components/ui/card.tsx` |
| `dialog` | `src/components/ui/dialog.tsx` |
| `input` | `src/components/ui/input.tsx` |
| `label` | `src/components/ui/label.tsx` |
| `select` | `src/components/ui/select.tsx` |
| `textarea` | `src/components/ui/textarea.tsx` |
| `toast` | `src/components/ui/toast.tsx` |

## Роуты API

| Методы | Путь | Кабинет | Guard | Write | Событие |
|---|---|---|---|---|---|
| GET | `/api/admin/attention` | admin | employee | — | нет |
| GET, POST | `/api/admin/brokers` | admin | employee | write | нет |
| PATCH | `/api/admin/brokers/{id}` | admin | employee | write | нет |
| GET, POST | `/api/admin/contractor-leads` | admin | employee | write | нет |
| DELETE, GET, PATCH | `/api/admin/contractor-leads/{id}` | admin | employee | write | нет |
| GET | `/api/admin/contractors` | admin | employee | — | нет |
| PATCH | `/api/admin/contractors/{id}` | admin | employee | write | нет |
| GET | `/api/admin/contracts` | admin | employee | — | нет |
| GET, POST | `/api/admin/customers` | admin | employee | write | нет |
| GET | `/api/admin/customers/{id}` | admin | employee | — | нет |
| POST | `/api/admin/customers/{id}/access` | admin | employee | write | нет |
| DELETE | `/api/admin/documents/{id}` | admin | employee | write | нет |
| POST | `/api/admin/documents/{id}/versions` | admin | employee | write | нет |
| GET, POST | `/api/admin/employees` | admin | employee | — | нет |
| PATCH | `/api/admin/employees/{id}` | admin | employee | — | нет |
| GET, POST | `/api/admin/leads` | admin | employee | write | нет |
| DELETE, GET, PATCH | `/api/admin/leads/{id}` | admin | employee | write | нет |
| POST | `/api/admin/leads/{id}/brokers` | admin | employee | write | нет |
| DELETE | `/api/admin/leads/{id}/brokers/{brokerId}` | admin | employee | write | нет |
| POST | `/api/admin/leads/{id}/convert` | admin | employee | write | нет |
| GET, POST | `/api/admin/leads/{id}/documents` | admin | employee | write | нет |
| POST | `/api/admin/leads/{id}/notes` | admin | employee | write | нет |
| POST | `/api/admin/leads/{id}/options` | admin | employee | write | нет |
| GET, POST | `/api/admin/legal-entities` | admin | employee | — | нет |
| PATCH | `/api/admin/legal-entities/{id}` | admin | employee | — | нет |
| DELETE, PATCH | `/api/admin/options/{id}` | admin | employee | write | нет |
| GET, POST | `/api/admin/orders` | admin | employee | write | нет |
| GET, PATCH | `/api/admin/orders/{id}` | admin | employee | write | нет |
| POST | `/api/admin/orders/{id}/brokers` | admin | employee | write | нет |
| DELETE | `/api/admin/orders/{id}/brokers/{brokerId}` | admin | employee | write | нет |
| GET, POST | `/api/admin/orders/{id}/documents` | admin | employee | write | нет |
| POST | `/api/admin/orders/{id}/notes` | admin | employee | write | нет |
| POST | `/api/admin/orders/{id}/stages` | admin | employee | write | нет |
| DELETE, PATCH | `/api/admin/orders/{id}/stages/{stageId}` | admin | employee | write | нет |
| GET | `/api/admin/search` | admin | employee | — | нет |
| GET, POST | `/api/admin/stage-catalog` | admin | employee | — | нет |
| DELETE, PATCH | `/api/admin/stage-catalog/{id}` | admin | employee | — | нет |
| POST | `/api/auth/broker/login` | auth | — | — | нет |
| POST | `/api/auth/broker/logout` | auth | — | — | нет |
| GET | `/api/auth/broker/me` | auth | — | — | нет |
| POST | `/api/auth/client/login` | auth | — | — | нет |
| POST | `/api/auth/client/logout` | auth | — | — | нет |
| GET | `/api/auth/client/me` | auth | — | — | нет |
| POST | `/api/auth/contractor/login` | auth | — | — | нет |
| POST | `/api/auth/contractor/logout` | auth | — | — | нет |
| GET | `/api/auth/contractor/me` | auth | — | — | нет |
| POST | `/api/auth/employee/login` | auth | — | — | нет |
| POST | `/api/auth/employee/logout` | auth | — | — | нет |
| GET | `/api/auth/employee/me` | auth | — | — | нет |
| POST | `/api/broker/documents/{id}/versions` | broker | broker | — | нет |
| GET | `/api/broker/leads` | broker | broker | — | нет |
| GET | `/api/broker/leads/{id}` | broker | broker | — | нет |
| GET, POST | `/api/broker/leads/{id}/documents` | broker | broker | — | нет |
| PUT | `/api/broker/leads/{id}/estimate` | broker | broker | — | нет |
| GET | `/api/broker/orders` | broker | broker | — | нет |
| GET | `/api/broker/orders/{id}` | broker | broker | — | нет |
| GET, POST | `/api/broker/orders/{id}/documents` | broker | broker | — | нет |
| POST | `/api/client/documents/{id}/versions` | client | client | — | нет |
| GET, POST | `/api/client/leads` | client | client | — | нет |
| GET, PATCH | `/api/client/leads/{id}` | client | client | — | нет |
| GET, POST | `/api/client/leads/{id}/documents` | client | client | — | нет |
| GET | `/api/client/orders` | client | client | — | нет |
| GET | `/api/client/orders/{id}` | client | client | — | нет |
| GET, POST | `/api/client/orders/{id}/documents` | client | client | — | нет |
| GET | `/api/contractor/orders` | contractor | contractor | — | нет |
| GET | `/api/contractor/orders/{id}` | contractor | contractor | — | нет |
| PATCH | `/api/contractor/orders/{id}/stages/{stageId}` | contractor | contractor | — | нет |
| GET | `/api/document-versions/{id}/file` | public | — | — | нет |
| GET | `/api/health` | public | — | — | нет |

## Модели Prisma

| Модель | Полей | Где используется |
|---|---|---|
| `Activity` | 14 | src/app/admin/(dashboard)/page.tsx, src/lib/activity.ts |
| `Broker` | 12 | src/app/api/admin/brokers/[id]/route.ts, src/app/api/admin/brokers/route.ts, src/app/api/admin/leads/[id]/brokers/route.ts, src/app/api/admin/orders/[id]/brokers/route.ts, src/app/api/auth/broker/login/route.ts |
| `BrokerEstimate` | 8 | src/app/api/broker/leads/[id]/estimate/route.ts |
| `BrokerSession` | 6 | src/lib/broker-auth.ts |
| `ClientSession` | 6 | src/app/api/admin/customers/[id]/access/route.ts, src/lib/client-auth.ts |
| `Contract` | 9 | src/app/api/admin/contracts/route.ts |
| `Contractor` | 15 | src/app/api/admin/contractor-leads/[id]/route.ts, src/app/api/admin/contractors/[id]/route.ts, src/app/api/admin/contractors/route.ts, src/app/api/admin/orders/[id]/stages/[stageId]/route.ts, src/app/api/auth/contractor/login/route.ts |
| `ContractorLead` | 9 | src/app/api/admin/contractor-leads/[id]/route.ts, src/app/api/admin/contractor-leads/route.ts |
| `ContractorSession` | 6 | src/lib/contractor-auth.ts |
| `Customer` | 12 | src/app/api/admin/customers/[id]/access/route.ts, src/app/api/admin/customers/[id]/route.ts, src/app/api/admin/customers/route.ts, src/app/api/admin/leads/route.ts, src/app/api/admin/orders/route.ts, src/app/api/auth/client/login/route.ts |
| `Document` | 12 | src/app/api/admin/documents/[id]/versions/route.ts, src/app/api/admin/leads/[id]/documents/route.ts, src/app/api/admin/orders/[id]/documents/route.ts, src/app/api/broker/leads/[id]/documents/route.ts, src/app/api/broker/orders/[id]/documents/route.ts, src/app/api/client/leads/[id]/documents/route.ts (+2) |
| `DocumentVersion` | 13 | src/app/api/document-versions/[id]/file/route.ts |
| `Employee` | 10 | scripts/seed.ts, scripts/set-master-password.ts, src/app/api/admin/employees/[id]/route.ts, src/app/api/admin/employees/route.ts, src/app/api/admin/leads/[id]/patch.ts, src/app/api/admin/orders/[id]/patch.ts (+1) |
| `EmployeeSession` | 6 | src/app/api/admin/employees/[id]/route.ts, src/lib/auth.ts |
| `Lead` | 26 | src/app/admin/(dashboard)/layout.tsx, src/app/api/admin/attention/route.ts, src/app/api/admin/leads/[id]/brokers/[brokerId]/route.ts, src/app/api/admin/leads/[id]/brokers/route.ts, src/app/api/admin/leads/[id]/convert/helpers.ts, src/app/api/admin/leads/[id]/convert/route.ts (+11) |
| `LeadBroker` | 7 | src/app/api/admin/leads/[id]/brokers/[brokerId]/route.ts, src/app/api/admin/leads/[id]/brokers/route.ts, src/app/api/broker/leads/[id]/documents/route.ts, src/app/api/broker/leads/[id]/estimate/route.ts, src/app/api/broker/leads/[id]/route.ts, src/app/api/broker/leads/route.ts |
| `LegalEntity` | 7 | scripts/seed.ts, src/app/api/admin/leads/[id]/convert/route.ts, src/app/api/admin/legal-entities/[id]/route.ts, src/app/api/admin/legal-entities/route.ts |
| `LoginAttempt` | 7 | src/lib/login-guard.ts |
| `Order` | 34 | src/app/admin/(dashboard)/layout.tsx, src/app/admin/orders/[id]/print/page.tsx, src/app/api/admin/attention/route.ts, src/app/api/admin/orders/[id]/brokers/[brokerId]/route.ts, src/app/api/admin/orders/[id]/brokers/route.ts, src/app/api/admin/orders/[id]/documents/route.ts (+14) |
| `OrderBroker` | 6 | src/app/api/admin/orders/[id]/brokers/[brokerId]/route.ts, src/app/api/admin/orders/[id]/brokers/route.ts, src/app/api/broker/orders/[id]/documents/route.ts |
| `OrderStageCatalog` | 5 | scripts/seed.ts, src/app/api/admin/attention/route.ts, src/app/api/admin/customers/[id]/route.ts, src/app/api/admin/orders/[id]/route.ts, src/app/api/admin/orders/[id]/stages/[stageId]/route.ts, src/app/api/admin/orders/[id]/stages/route.ts (+11) |
| `OrderStageInstance` | 11 | src/app/api/admin/orders/[id]/stages/[stageId]/route.ts, src/app/api/admin/orders/[id]/stages/route.ts, src/app/api/contractor/orders/[id]/stages/[stageId]/route.ts, src/lib/orders.ts |
| `QuoteOption` | 14 | src/app/api/admin/leads/[id]/patch.ts, src/app/api/admin/options/[id]/route.ts |

## Переменные окружения

| Переменная | Файлов с использованием | .env.example | DEPLOY.md |
|---|---|---|---|
| `ADMIN_PASSWORD` | 1 | да | да |
| `ADMIN_PHONE` | 1 | да | да |
| `BASE_URL` | 1 | да | да |
| `DATABASE_URL` | 5 | да | да |
| `DISABLE_RATE_LIMIT` | 1 | да | да |
| `MASTER_PASSWORD` | 2 | да | да |
| `MASTER_PHONE` | 2 | да | да |
| `NODE_ENV` | 2 | — | да |
| `SHADOW_URL` | 1 | — | да |
| `TRUSTED_PROXY` | 1 | да | да |
| `VERCEL` | 1 | да | да |
| `VERCEL_GIT_COMMIT_SHA` | 1 | да | да |

## Скрипты package.json

| Скрипт | Команда |
|---|---|
| `build` | `prisma generate && next build` |
| `db:baseline` | `prisma migrate resolve --applied 20261023000000_baseline` |
| `db:deploy` | `prisma migrate deploy` |
| `db:generate` | `prisma generate` |
| `db:migrate` | `prisma migrate dev` |
| `db:push` | `prisma db push` |
| `dev` | `next dev -p 3000 -H 0.0.0.0` |
| `integrity` | `python3 scripts/integrity_check.py` |
| `inventory` | `python3 scripts/inventory.py` |
| `lint` | `eslint` |
| `scope:check` | `python3 scripts/scope.py check` |
| `scope:init` | `python3 scripts/scope.py init` |
| `seed` | `tsx scripts/seed.ts` |
| `set-master` | `tsx scripts/set-master-password.ts` |
| `start` | `next start` |
| `test` | `vitest run` |
| `test:e2e` | `python3 scripts/e2e_api_test.py` |
