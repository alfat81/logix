<!-- Автогенерируемый файл (scripts/inventory.py, DF-00B). Руками не править. -->
<!-- Регенерация: python3 scripts/inventory.py; расхождение с кодом ловит IC-12 и CI. -->

# INVENTORY — индекс инструментов проекта

Назначение (гейт G1, docs/ROADMAP-DEALFLOW.md §4.7): перед созданием нового хелпера,
компонента, роута или скрипта проверить здесь и в коде, что аналога ещё нет.
Подробности — docs/RULES.md (2.13 reuse-first).


## Экспорты src/lib

| Экспорт | Файл | Назначение (первая строка комментария) |
|---|---|---|
| `ACTIVITY_FEED_TAKE` | `src/lib/activity.ts` | Лимит выдачи: лента без пагинации (Ж4 сделает постраничность для |
| `ACTIVITY_PUBLIC_FIELDS` | `src/lib/activity.ts` | ── Чтение ленты (GET карточек) ───────────────────────────────────── |
| `ACTIVITY_TYPES` | `src/lib/activity.ts` | Стабильные коды событий: расширение списка — правка здесь, значения |
| `AUDIENCES` | `src/lib/audience.ts` | — |
| `ActivityActor` | `src/lib/activity.ts` | Кто действовал. Сотрудник, подрядчик, клиент (И1 — запрос из |
| `ActivityTarget` | `src/lib/activity.ts` | Цель-сделка — ровно одна из трёх. Дискриминированное объединение: |
| `ActivityType` | `src/lib/activity.ts` | — |
| `ActorNameReader` | `src/lib/actor-name.ts` | Роль читателя: сотрудник (проекция «Имя (Компания)») или внешний |
| `ActorRef` | `src/lib/actor-name.ts` | Минимальная ссылка на актёра (строка Activity)… |
| `Audience` | `src/lib/audience.ts` | — |
| `AuthorRef` | `src/lib/actor-name.ts` | …и на автора (строка DocumentVersion) — та же семантика, другие имена |
| `BROKER_COMPANY_NAME_MAX` | `src/lib/brokers.ts` | Название компании — потолок как у подрядчика (Г2). |
| `BROKER_EMAIL_MAX` | `src/lib/brokers.ts` | DF-02: контактный email компании брокера для уведомлений |
| `BROKER_KIND_LABELS` | `src/lib/brokers.ts` | Пометка «штатный/привлечённый» для списков. |
| `BROKER_PASSWORD_MAX` | `src/lib/brokers.ts` | — |
| `BROKER_PASSWORD_MIN` | `src/lib/brokers.ts` | Пароль урезанного ЛК брокера. Жёстче подрядчицкого (6, Г2 — только |
| `BROKER_PUBLIC_FIELDS` | `src/lib/brokers.ts` | ─── Публичная проекция брокера (Д) ─────────────────────────────── |
| `BROKER_SESSION_COOKIE` | `src/lib/broker-auth.ts` | Кабинет брокера (Д). Механизм сессий — lib/portal-auth.ts. |
| `Brand` | `src/lib/brand.ts` | — |
| `BrokerActor` | `src/lib/activity.ts` | — |
| `BrokerEmailSchema` | `src/lib/brokers.ts` | — |
| `BrokerEstimateFullSchema` | `src/lib/brokers.ts` | Расширение контракта PUT оценки: старые поля принимаются как раньше, |
| `BrokerEstimateInput` | `src/lib/brokers.ts` | — |
| `BrokerEstimateSchema` | `src/lib/brokers.ts` | — |
| `BrokerLinkSnapshot` | `src/lib/broker-links.ts` | Снимок связи для 404 и имени брокера в событии/ответе. |
| `BrokerLoginUser` | `src/lib/company-users.ts` | — |
| `CARGO_PROFILES` | `src/lib/order-constants.ts` | Профиль груза (роадмап, раздел 6: негабарит/опасные — глубже в Phase 2). |
| `CARGO_PROFILE_LABELS` | `src/lib/order-constants.ts` | — |
| `CHOICE_FOLLOWUP_BUSINESS_DAYS` | `src/lib/waiting.ts` | ─── D45: эскалация «клиент не выбрал расчёт» ──────────────────────── |
| `CLIENT_LEAD_DAILY_LIMIT` | `src/lib/client-constants.ts` | Дневной потолок запросов из кабинета на клиента (анти-спам внешнего |
| `CLIENT_PASSWORD_MAX` | `src/lib/client-constants.ts` | — |
| `CLIENT_PASSWORD_MIN` | `src/lib/client-constants.ts` | Пароль доступа в кабинет — те же рамки, что у сотрудников (Ж6в) и |
| `CLIENT_SESSION_COOKIE` | `src/lib/client-auth.ts` | Кабинет клиента (И1). Механизм сессий — lib/portal-auth.ts. |
| `COMPETENCIES_DIRECTIONS_KEY` | `src/lib/contractors.ts` | — |
| `COMPETENCIES_TRANSPORT_KEY` | `src/lib/contractors.ts` | — |
| `CONTRACTOR_LEAD_BADGE_VARIANTS` | `src/lib/status-badges.ts` | Кандидат в подрядчики (Г1): новый — ожидание расчёта (review), |
| `CONTRACTOR_LEAD_STATUSES` | `src/lib/contractors.ts` | ─── Статусы кандидата (ContractorLead, Г1/Г2) ────────────────────── |
| `CONTRACTOR_LEAD_STATUS_LABELS` | `src/lib/contractors.ts` | — |
| `CONTRACTOR_PUBLIC_FIELDS` | `src/lib/contractors.ts` | ─── Публичная проекция подрядчика (Г3) ───────────────────────── |
| `CONTRACTOR_RAW_INFO_LABELS` | `src/lib/contractors.ts` | ─── Конвенции Json для UI (Г5) ──────────────────────────────────── |
| `CONTRACTOR_SESSION_COOKIE` | `src/lib/contractor-auth.ts` | Кабинет подрядчика (Г4). Механизм сессий — lib/portal-auth.ts. |
| `CURRENCIES` | `src/lib/money.ts` | ─── Валюты (DF-17) ────────────────────────────────────────────────── |
| `CURRENCY_SIGNS` | `src/lib/money.ts` | Знаки валют — короткие символы в интерфейсе (Intl style:'currency' |
| `CUSTOMS_EVALUATION_NOTE` | `src/lib/customs.ts` | Обязательная подпись расчёта в UI и печатных формах (D41). |
| `CUSTOMS_ISO_DATE_RE` | `src/lib/customs.ts` | — |
| `CUSTOMS_ITEMS_HARD_CAP` | `src/lib/customs.ts` | Потолок строк расчёта (свой, не broker.max_items: расчёт шире ответа |
| `CUSTOMS_RULES_VERSION` | `src/lib/customs.ts` | — |
| `CalcBodyResult` | `src/lib/customs-api.ts` | — |
| `CalcWriteCtx` | `src/lib/customs-api.ts` | — |
| `CargoInfoSchema` | `src/lib/leads.ts` | Свободная анкета груза на этапе запроса (груз/вес/объём/откуда-куда). |
| `CargoOrderInput` | `src/lib/pulse.ts` | ─── «Где груз» (блок 2) ───────────────────────────────────────────── |
| `CargoProfile` | `src/lib/order-constants.ts` | — |
| `CbrRate` | `src/lib/cbr.ts` | — |
| `ClientActor` | `src/lib/activity.ts` | — |
| `ClientCreateRequestInput` | `src/lib/client-constants.ts` | — |
| `ClientCreateRequestSchema` | `src/lib/client-constants.ts` | Тело POST /api/client/leads — запрос из кабинета. Груз — та же |
| `ClientLeadEditInput` | `src/lib/lead-edit.ts` | — |
| `ClientLeadEditSchema` | `src/lib/lead-edit.ts` | Тело PATCH из кабинета клиента: клиент правит ТОЛЬКО анкету груза |
| `CompanyLoginResult` | `src/lib/company-users.ts` | — |
| `CompanyUserError` | `src/lib/company-users.ts` | Бизнес-ошибка управления пользователями: роуты отдают её клиенту |
| `ComputeCustomsInput` | `src/lib/customs.ts` | — |
| `ContractorCompetenciesSchema` | `src/lib/contractors.ts` | Компетенции подрядчика (competencies Json, Г1) — тоже record: виды |
| `ContractorContactInfoSchema` | `src/lib/contractors.ts` | Контактные данные подрядчика (contactInfo Json, Г1) — сырой Json по |
| `ContractorLeadStatus` | `src/lib/contractors.ts` | — |
| `ConvertLeadInput` | `src/lib/leads.ts` | — |
| `ConvertLeadSchema` | `src/lib/leads.ts` | ─── Конвертация лида в заявку (В4) ───────────────────────────────── |
| `CreateBrokerInput` | `src/lib/brokers.ts` | — |
| `CreateBrokerSchema` | `src/lib/brokers.ts` | ─── Создание брокера: POST /api/admin/brokers (Д) ──────────────── |
| `CreateCompanyUserData` | `src/lib/company-users.ts` | — |
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
| `CurrentBroker` | `src/lib/broker-auth.ts` | id — КОМПАНИЯ (brokerId): скоупинг кабинетских роутов не меняется. |
| `CurrentClient` | `src/lib/client-auth.ts` | id — КОМПАНИЯ (customerId): скоупинг кабинетских роутов не меняется. |
| `CurrentContractor` | `src/lib/contractor-auth.ts` | — |
| `CurrentEmployee` | `src/lib/auth.ts` | — |
| `CustomerLoginUser` | `src/lib/company-users.ts` | ── Вход (Блок 3, DF-02A): учётка — человек, UX прежний ────────────── |
| `CustomsCalcInput` | `src/lib/customs.ts` | — |
| `CustomsCalcInputSchema` | `src/lib/customs.ts` | — |
| `CustomsCalcItemSchema` | `src/lib/customs.ts` | — |
| `CustomsCalculationRow` | `src/lib/customs-server.ts` | — |
| `CustomsComputedItem` | `src/lib/customs.ts` | — |
| `CustomsFeeRow` | `src/lib/customs.ts` | — |
| `CustomsFxEntry` | `src/lib/customs.ts` | Снимок курса за одну единицу: { USD: { rate: '73.1275', date: '2026-05-18', source: 'cbr' } } |
| `CustomsFxSnapshot` | `src/lib/customs.ts` | — |
| `CustomsInputError` | `src/lib/customs.ts` | — |
| `CustomsItemInput` | `src/lib/customs.ts` | — |
| `CustomsNotFoundError` | `src/lib/customs-server.ts` | Расчёт не найден (роут отдаёт 404) |
| `CustomsRuleFlags` | `src/lib/customs.ts` | — |
| `CustomsRulesDraftError` | `src/lib/customs-server.ts` | Правила условия поставки — черновик (meta.draft): расчёт не |
| `CustomsTotals` | `src/lib/customs.ts` | — |
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
| `DealCodeColumns` | `src/lib/ref-db.ts` | ─── Коды сделки одним вызовом (DF-17, RULES 2.15 — одно место знания) ── |
| `DealParticipants` | `src/lib/participants.ts` | — |
| `DealRef` | `src/lib/notifications/templates.ts` | — |
| `DigestRun` | `src/lib/notifications/digest.ts` | — |
| `DispatchRun` | `src/lib/notifications/dispatch.ts` | — |
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
| `EMPLOYEE_EMAIL_MAX` | `src/lib/employees.ts` | DF-02: контактный email для уведомлений (адресат-человек, DF-03). |
| `EMPLOYEE_NAME_MAX` | `src/lib/employees.ts` | Имя для карточки справочника. |
| `EMPLOYEE_PASSWORD_MAX` | `src/lib/employees.ts` | — |
| `EMPLOYEE_PASSWORD_MIN` | `src/lib/employees.ts` | Стартовый/новый пароль сотрудника. Жёстче подрядчицкого (6, Г2 — |
| `EMPLOYEE_PUBLIC_FIELDS` | `src/lib/employees.ts` | ─── Публичная проекция сотрудника (Ж6в) ────────────────────────── |
| `EMPLOYEE_ROLES` | `src/lib/employees.ts` | Роли сотрудников. Employee.roles в БД — JSON-строка ("["master"]"), |
| `EMPLOYEE_ROLE_LABELS` | `src/lib/employees.ts` | — |
| `EMPTY_LEAD_CARGO_FORM` | `src/lib/leads.ts` | — |
| `ESTIMATE_ITEM_HARD_CAP` | `src/lib/brokers.ts` | ─── DF-18: строки ответа брокера по кодам ТН ВЭД (D38) ──────────── |
| `ESTIMATE_NOTES_MAX` | `src/lib/brokers.ts` | — |
| `ESTIMATE_NOTE_MAX` | `src/lib/brokers.ts` | — |
| `EVENT_TYPES` | `src/lib/event-registry.ts` | — |
| `EmailProvider` | `src/lib/notifications/transports/email.ts` | — |
| `EmailSender` | `src/lib/brand.ts` | — |
| `EmitEventInput` | `src/lib/events.ts` | — |
| `EmployeeActor` | `src/lib/activity.ts` | Конкретные типы актёров (Е: документы требуют ровно один из трёх |
| `EmployeeEmailSchema` | `src/lib/employees.ts` | — |
| `EmployeeRole` | `src/lib/auth.ts` | Роли — JSON-массив в Employee.roles (не enum БД): новая роль — правка |
| `EmployeeRoleName` | `src/lib/employees.ts` | — |
| `EstimateItemSchema` | `src/lib/brokers.ts` | — |
| `EventMeta` | `src/lib/event-registry.ts` | Метаданные типа события: подпись (подпись письма/фильтры), аудитория |
| `HS_SEARCH_LIMIT_DEFAULT` | `src/lib/hs-db.ts` | — |
| `HS_SEARCH_LIMIT_MAX` | `src/lib/hs-db.ts` | — |
| `HsSearchItem` | `src/lib/hs-db.ts` | — |
| `HsSearchResult` | `src/lib/hs-db.ts` | — |
| `INCOTERM_TRANSPORT_LABELS` | `src/lib/ref.ts` | — |
| `IncotermMeta` | `src/lib/ref.ts` | ─── Инкотермс: meta-флаги (данные, не логика — DF-19 считает) ────── |
| `LEAD_ACTIVE_STATUSES` | `src/lib/leads.ts` | v0.3.1 (BRANDBOOK §4.1): счётчик навигации у «Лидов» — активные, |
| `LEAD_BADGE_VARIANTS` | `src/lib/status-badges.ts` | Лид: new/calculated — ждём расчёта/выбора (нейтральная пара review, |
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
| `LetterDraft` | `src/lib/notifications/templates.ts` | — |
| `LoginKind` | `src/lib/login-guard.ts` | — |
| `MAX_LIST_TAKE` | `src/lib/list-query.ts` | — |
| `MAX_QUERY_LENGTH` | `src/lib/list-query.ts` | — |
| `MIN_QUERY_LENGTH` | `src/lib/search-constants.ts` | Меньше 2 символов роут не ищет (200 с пустыми секциями): одиночная |
| `MSK_OFFSET_MS` | `src/lib/business-days.ts` | Сдвиг МСК от UTC: якорь ожидания хранится в UTC, а «рабочий день» |
| `NOTE_MAX_LENGTH` | `src/lib/note-constants.ts` | Потолок текста заметки: лента остаётся читаемой, textarea UI |
| `NOT_CONFIGURED` | `src/lib/notifications/transport.ts` | Канал не настроен — терминальный статус skipped (не ошибка доставки: |
| `NoteRow` | `src/lib/activity.ts` | Запись заметки. В отличие от logActivity (наблюдение над действием — |
| `NotificationEnvelope` | `src/lib/notifications/rules.ts` | Конверт — строка будущей очереди без текстов: кому (kind+id+адрес), |
| `NotificationTransport` | `src/lib/notifications/transport.ts` | — |
| `NotifyHint` | `src/lib/events.ts` | Подсказка правилам уведомлений для событий, где из самой записи |
| `NotifyMode` | `src/lib/notifications/rules.ts` | — |
| `NotifyRule` | `src/lib/event-registry.ts` | Кто получит уведомление (DF-03, матрица §8 ROADMAP-DEALFLOW; точные |
| `ORDER_ACTIVE_STATUSES` | `src/lib/order-constants.ts` | v0.3.1 (BRANDBOOK §4.2): табы-группы списка заявок. «Активные» — |
| `ORDER_BADGE_VARIANTS` | `src/lib/status-badges.ts` | Заявка: расчёт и согласование — нейтральная пара review (v1.3 §3.2), |
| `ORDER_SORTS` | `src/lib/orders.ts` | ─── Сортировки списка заявок (Ж4; v0.3.1 — переезд из роута, ────── |
| `ORDER_STATUSES` | `src/lib/order-constants.ts` | Верхнеуровневый статус заявки — ручной, менеджер переводит осознанно |
| `ORDER_STATUS_LABELS` | `src/lib/order-constants.ts` | — |
| `ORDER_TRANSITIONS` | `src/lib/status-machine.ts` | ─── Заявка: Расчёт → Согласование → В работе → Завершена ───── |
| `OrderStagesSummary` | `src/lib/order-summary.ts` | — |
| `OrderStatus` | `src/lib/order-constants.ts` | — |
| `OrderStatusSuggestion` | `src/lib/status-suggest.ts` | — |
| `OwnerDigestDecision` | `src/lib/notifications/owner-digest.ts` | — |
| `OwnerDigestLetterInput` | `src/lib/notifications/owner-digest.ts` | — |
| `OwnerDigestRun` | `src/lib/notifications/owner-digest.ts` | — |
| `PERMIT_MAX_COUNT` | `src/lib/brokers.ts` | ─── Оценка таможенных платежей (BrokerEstimate, роадмап 5а) ────── |
| `PERMIT_MAX_LENGTH` | `src/lib/brokers.ts` | — |
| `PLACE_KIND_LABELS` | `src/lib/ref.ts` | — |
| `PULSE_CARGO_LIMIT` | `src/lib/pulse.ts` | ─── Объёмы выдачи (срезы лимитом, счётчики — полные, как в Ж5) ────── |
| `PULSE_EVENTS_LIMIT` | `src/lib/pulse.ts` | — |
| `PULSE_EVENT_WINDOW_HOURS` | `src/lib/pulse.ts` | — |
| `PULSE_KIND_TITLES` | `src/lib/pulse.ts` | Заголовки групп: дательный падеж «Мяч у …». WAITING_KIND_LABELS — |
| `PULSE_SLOWING_GROUP_LIMIT` | `src/lib/pulse.ts` | — |
| `ParsedDocumentForm` | `src/lib/documents.ts` | — |
| `ParsedListQuery` | `src/lib/list-query.ts` | — |
| `ParsedVersionForm` | `src/lib/documents.ts` | — |
| `ParticipantCompany` | `src/lib/participants.ts` | Компания-участник (клиент или брокер): реквизиты + активные |
| `ParticipantContractor` | `src/lib/participants.ts` | Подрядчик-исполнитель этапа — справочно (не адресат, D31). |
| `ParticipantPerson` | `src/lib/participants.ts` | Человек-участник: сотрудник либо пользователь кабинета (DF-02A). |
| `PatchBrokerEmailSchema` | `src/lib/brokers.ts` | Для PATCH: null = очистить поле, отсутствие = не менять. |
| `PatchBrokerInput` | `src/lib/brokers.ts` | — |
| `PatchBrokerSchema` | `src/lib/brokers.ts` | ─── PATCH брокера: /api/admin/brokers/[id] (Д) ─────────────────── |
| `PatchContractorInput` | `src/lib/contractors.ts` | — |
| `PatchContractorLeadInput` | `src/lib/contractors.ts` | — |
| `PatchContractorLeadSchema` | `src/lib/contractors.ts` | ─── PATCH кандидата: смена статуса / рождение подрядчика ─────────── |
| `PatchContractorSchema` | `src/lib/contractors.ts` | ─── PATCH подрядчика пула: /api/admin/contractors/[id] (Г3) ───── |
| `PatchEmployeeEmailSchema` | `src/lib/employees.ts` | Для PATCH: null = очистить поле, отсутствие = не менять. |
| `PatchEmployeeInput` | `src/lib/employees.ts` | — |
| `PatchEmployeeSchema` | `src/lib/employees.ts` | ─── PATCH сотрудника: /api/admin/employees/[id] (Ж6в) ──────────── |
| `PatchLeadInput` | `src/lib/leads.ts` | — |
| `PatchLeadSchema` | `src/lib/leads.ts` | PATCH лида — смена статуса (+ причина при отказе), ответственного |
| `PortalRequireResult` | `src/lib/portal-auth.ts` | — |
| `PulseCargoRow` | `src/lib/pulse.ts` | — |
| `PulseCore` | `src/lib/pulse-db.ts` | ─── DF-07/DF-08: серверная сборка блоков 1–3 «Пульса» ─────────────── |
| `PulseData` | `src/lib/pulse.ts` | ─── Ответ API целиком (клиентские типы Пульса реэкспортируют отсюда) ─ |
| `PulseEvent` | `src/lib/pulse.ts` | — |
| `PulseStats` | `src/lib/pulse.ts` | ─── Цифры (блок 1) ────────────────────────────────────────────────── |
| `QUOTE_PRIORITY_FITS` | `src/lib/leads.ts` | Ориентир варианта: под какой приоритет клиента этот вариант заточен |
| `QUOTE_PRIORITY_FIT_LABELS` | `src/lib/leads.ts` | — |
| `QueuedEventInput` | `src/lib/notifications/enqueue.ts` | — |
| `QuotePriorityFit` | `src/lib/leads.ts` | — |
| `QuoteSnapshotInput` | `src/lib/leads.ts` | — |
| `QuoteSnapshotSchema` | `src/lib/leads.ts` | ─── Снимок условий сделки (Ж1) ───────────────────────────────────── |
| `REF_DIRS` | `src/lib/ref.ts` | dir-ы справочника — закрытый список: каждый dir = отдельный источник |
| `REF_DIR_LABELS` | `src/lib/ref.ts` | — |
| `REQUISITE_FIELDS` | `src/lib/requisite-fields.ts` | — |
| `RatesImportResult` | `src/lib/cbr.ts` | — |
| `RawContact` | `src/lib/leads.ts` | — |
| `RawContactSchema` | `src/lib/leads.ts` | Черновая анкета контакта на этапе запроса (В1, rawContact Json). |
| `RawContractorInfoSchema` | `src/lib/contractors.ts` | Черновая анкета кандидата (rawInfo Json, Г1) — толерантный record, как |
| `Recipient` | `src/lib/participants.ts` | Адресат уведомления по компании-клиенту (recipientsOfCustomer): |
| `RecipientKind` | `src/lib/notifications/rules.ts` | — |
| `RefDir` | `src/lib/ref.ts` | — |
| `RefListItem` | `src/lib/ref-db.ts` | — |
| `RefOption` | `src/lib/ref.ts` | ─── Поиск по справочнику (чистая функция — unit-тесты) ───────────── |
| `RequisiteField` | `src/lib/requisite-fields.ts` | — |
| `ResolvedDealEvent` | `src/lib/notifications/rules.ts` | Событие в терминах правил (снимок из emitEvent, lib/events.ts). |
| `ResolvedRefs` | `src/lib/ref-db.ts` | Коды → имена: для денормализации текстовых колонок на записи и для |
| `RetryOutcome` | `src/lib/notifications/retry.ts` | — |
| `RouteFieldsInput` | `src/lib/route-fields.ts` | — |
| `RouteFieldsSchema` | `src/lib/route-fields.ts` | ── zod-схема route-полей (тела POST/PATCH) ───────────────────────── |
| `SEARCH_TAKE` | `src/lib/search-constants.ts` | Сколько строк на секцию (заявки / лиды) возвращает глобальный поиск. |
| `SESSION_COOKIE` | `src/lib/auth.ts` | — |
| `SETTINGS` | `src/lib/settings.ts` | — |
| `SETTING_GROUPS` | `src/lib/settings.ts` | — |
| `SETTING_GROUP_LABELS` | `src/lib/settings.ts` | — |
| `STAFF_READER` | `src/lib/actor-name.ts` | Единственный скоуп роутов админки — константа вместо литерала в |
| `STAGE_BADGE_VARIANTS` | `src/lib/status-badges.ts` | Этап: не начат — нейтрально, в работе — движение, готов — успех, |
| `STAGE_STATUSES` | `src/lib/order-constants.ts` | Статус этапа внутри заявки (роадмап, раздел 3): не начат → в работе → |
| `STAGE_STATUS_LABELS` | `src/lib/order-constants.ts` | — |
| `SYSTEM_ACTOR` | `src/lib/activity.ts` | — |
| `SYSTEM_ACTOR_NAME` | `src/lib/events.ts` | — |
| `SendResult` | `src/lib/notifications/transport.ts` | — |
| `SettingDef` | `src/lib/settings.ts` | — |
| `SettingGroup` | `src/lib/settings.ts` | — |
| `SettingKey` | `src/lib/settings.ts` | — |
| `SettingType` | `src/lib/settings.ts` | type — рендер поля на экране настроек: время, список времён, число, |
| `SettingValidationError` | `src/lib/settings-validators.ts` | Ошибка валидации/неизвестного ключа: API /api/admin/settings |
| `SettingValue` | `src/lib/settings.ts` | value — Json: форма зависит от типа; структуру знает реестр, БД не |
| `SettingsValues` | `src/lib/settings.ts` | Ключ → тип значения: getSetting/setSetting типизированы по реестру, |
| `SlowingGroup` | `src/lib/pulse.ts` | — |
| `SlowingOrder` | `src/lib/pulse.ts` | — |
| `SlowingOrderInput` | `src/lib/pulse.ts` | ─── «Кто тормозит» (блок 3) ───────────────────────────────────────── |
| `StageStatus` | `src/lib/order-constants.ts` | — |
| `StageView` | `src/lib/order-summary.ts` | — |
| `StageViewRow` | `src/lib/order-summary.ts` | — |
| `StatusBadgeVariant` | `src/lib/status-badges.ts` | — |
| `TERMINAL_ORDER_STATUSES` | `src/lib/status-machine.ts` | Терминальные статусы заявки: переход «из них» — только мастеру |
| `TRANSPORT_FORM_TO_CODE` | `src/lib/route-fields.ts` | Форма бланка хранит русские подписи (TRANSPORT_TYPES); на колонки |
| `TRANSPORT_TYPES` | `src/lib/leads.ts` | Тип перевозки (бланк, п.3). Значения — русские строки: Json груза |
| `TRANSPORT_TYPE_CODES` | `src/lib/route-fields.ts` | Стабильные коды колонок (Prisma enum TransportType). Русские подписи |
| `TRANSPORT_TYPE_LABELS` | `src/lib/route-fields.ts` | — |
| `TopSlowingRow` | `src/lib/notifications/owner-digest.ts` | — |
| `TransitionOption` | `src/lib/status-machine.ts` | ─── Проекции для UI (P1-05: показываем только допустимое) ──── |
| `TransitionResult` | `src/lib/status-machine.ts` | — |
| `TransportMessage` | `src/lib/notifications/transport.ts` | — |
| `TransportModesSchema` | `src/lib/leads.ts` | Виды транспорта в варианте — свободный список непустых строк («Авто», |
| `TransportType` | `src/lib/leads.ts` | — |
| `TransportTypeCode` | `src/lib/route-fields.ts` | — |
| `UpdateCompanyUserData` | `src/lib/company-users.ts` | — |
| `UpdateQuoteOptionInput` | `src/lib/leads.ts` | — |
| `UpdateQuoteOptionSchema` | `src/lib/leads.ts` | PATCH варианта: любое подмножество полей, но не пустое. Инвариант |
| `UserNameMap` | `src/lib/actor-name.ts` | — |
| `VAT_MODES` | `src/lib/money.ts` | Режим НДС — метка цены, НЕ расчёт (см. enum VatMode в схеме). |
| `VAT_MODE_LABELS` | `src/lib/money.ts` | — |
| `VatModeCode` | `src/lib/money.ts` | — |
| `VisibleDocument` | `src/lib/documents.ts` | — |
| `WAITING_CHOICE_FOLLOWUP_ACTION` | `src/lib/waiting.ts` | Полный текст-действие (секция «Ждут дольше N часов», tooltip бейджа). |
| `WAITING_CHOICE_FOLLOWUP_SHORT` | `src/lib/waiting.ts` | Короткий хвост плашки на карточке: «Ждёт: клиента · 3 дн. — уточнить расчёт». |
| `WAITING_CLIENT_LABELS` | `src/lib/waiting.ts` | Нейтральные формулировки для клиента (кабинет клиента показывает |
| `WAITING_KINDS` | `src/lib/waiting.ts` | — |
| `WAITING_KIND_LABELS` | `src/lib/waiting.ts` | Подписи для плашки «Ждёт: …» (родительный падеж). В UI сотрудника. |
| `WAITING_NONE` | `src/lib/waiting.ts` | — |
| `WAITING_REASONS` | `src/lib/waiting.ts` | — |
| `WAITING_REASON_LABELS` | `src/lib/waiting.ts` | — |
| `WINDOW_GRACE_MINUTES` | `src/lib/notifications/windows.ts` | Допуск планировщика (карточка DF-03): окно выполняется, если вызов |
| `WaitingBrokerSnapshot` | `src/lib/waiting.ts` | — |
| `WaitingKind` | `src/lib/waiting.ts` | — |
| `WaitingLeadSnapshot` | `src/lib/waiting.ts` | — |
| `WaitingLongAttention` | `src/lib/attention-waiting.ts` | — |
| `WaitingLongLeadRow` | `src/lib/attention-waiting.ts` | — |
| `WaitingLongOrderRow` | `src/lib/attention-waiting.ts` | — |
| `WaitingOrderSnapshot` | `src/lib/waiting.ts` | — |
| `WaitingOutcome` | `src/lib/waiting.ts` | Результат правила: kind 'none' — мяча нет (id/reason пустые). |
| `WaitingReason` | `src/lib/waiting.ts` | — |
| `WaitingStageSnapshot` | `src/lib/waiting.ts` | — |
| `ZonedNow` | `src/lib/notifications/windows.ts` | — |
| `addDocumentVersion` | `src/lib/documents.ts` | — |
| `allocateComponent` | `src/lib/customs.ts` | Доли компонента baseCents по весам (одинаковый масштаб, BigInt): |
| `allocationMethods` | `src/lib/customs.ts` | Метод компонента: переопределение менеджера > правило ДТС-1 |
| `allowedLeadTransitionsLabeled` | `src/lib/status-machine.ts` | — |
| `allowedOrderTransitionsLabeled` | `src/lib/status-machine.ts` | — |
| `apiErrorResponse` | `src/lib/api-errors.ts` | — |
| `asEventCodeList` | `src/lib/settings-validators.ts` | Коды «красных» событий — только из реестра ACTIVITY_TYPES: свободный |
| `asInt` | `src/lib/settings-validators.ts` | — |
| `asNonEmptyStr` | `src/lib/settings-validators.ts` | — |
| `asOneOf` | `src/lib/settings-validators.ts` | — |
| `asOptionalEmail` | `src/lib/settings-validators.ts` | — |
| `asOptionalStr` | `src/lib/settings-validators.ts` | Пустая строка легитимна («не задано»): brand.signature, email.reply_to. |
| `asPercent` | `src/lib/settings-validators.ts` | Проценты с двумя знаками после запятой, 0..max (customs.fx_reserve_percent, |
| `asStringList` | `src/lib/settings-validators.ts` | — |
| `asTime` | `src/lib/settings-validators.ts` | — |
| `asTimeList` | `src/lib/settings-validators.ts` | — |
| `asTimezone` | `src/lib/settings-validators.ts` | — |
| `authenticateBrokerLogin` | `src/lib/company-users.ts` | — |
| `authenticateCustomerLogin` | `src/lib/company-users.ts` | — |
| `brokerActor` | `src/lib/activity.ts` | Брокер портала (Д). DF-02A (Блок 4): актор — ЧЕЛОВЕК (userId), |
| `brokerSessionCookieOptions` | `src/lib/broker-auth.ts` | — |
| `buildCargoRow` | `src/lib/pulse.ts` | Строка «Где груз» из заявки с этапами: ближайший этап, исполнитель, |
| `buildFxSnapshot` | `src/lib/customs-server.ts` | ─── Снимок курсов: за ОДНУ единицу, источник cbr | manual ─────────── |
| `buildLeadEditDiff` | `src/lib/lead-edit.ts` | Diff анкеты: список строк «Подпись: старое → новое» (только реально |
| `buildLeadPayload` | `src/lib/leads.ts` | — |
| `buildOrderListWhere` | `src/lib/orders.ts` | where списка: статус ИЛИ группа «active» (BRANDBOOK §4.2), фильтр |
| `buildOrderSearch` | `src/lib/orders.ts` | Поиск — только по заявке и её клиенту: номер, ТН ВЭД, имя, телефон. |
| `buildOwnerDigestLetter` | `src/lib/notifications/owner-digest.ts` | — |
| `buildWaitingLong` | `src/lib/attention-waiting.ts` | — |
| `businessDaysElapsed` | `src/lib/business-days.ts` | Сколько рабочих дней (пн–пт, МСК) прошло ПОСЛЕ MSK-дня якоря, |
| `calcErrorResponse` | `src/lib/customs-api.ts` | Маппинг доменных ошибок DF-19: черновые правила — 409 (состояние |
| `calcOrderEta` | `src/lib/order-summary.ts` | v0.3.1 (BRANDBOOK §4.3): ETA заявки — обещанная дата завершения. |
| `calculationsListResponse` | `src/lib/customs-api.ts` | — |
| `canSeeDocument` | `src/lib/audience.ts` | Видимость ДОКУМЕНТА аудитории (не сделки!): внутренний документ — |
| `cargoFormFromData` | `src/lib/leads.ts` | Обратный разбор в состояние формы (Ж1: правка груза ЗАЯВКИ, правка |
| `carryDocumentsToOrder` | `src/lib/documents.ts` | ── Перенос при конвертации (В4): лид → заявка ────────────────────── |
| `cbrImportEnabled` | `src/lib/cbr.ts` | Выключатель для CI/e2e (без внешней сети): CBR_IMPORT=off. |
| `centsOf` | `src/lib/customs.ts` | Строка с двумя знаками (наши же centsToStr) → копейки |
| `centsToStr` | `src/lib/customs.ts` | Копейки → строка с двумя знаками (формат Decimal для БД и UI) |
| `checkLeadTransition` | `src/lib/status-machine.ts` | — |
| `checkLoginGuard` | `src/lib/login-guard.ts` | — |
| `checkOrderTransition` | `src/lib/status-machine.ts` | — |
| `ciContains` | `src/lib/list-query.ts` | Тип — надстройка над Prisma StringFilter: в postgres-генерации клиент |
| `clearSettingsCache` | `src/lib/settings.ts` | Сброс кэша: тесты и административные операции (после массовых правок). |
| `clientActor` | `src/lib/activity.ts` | Клиент кабинета (И1). DF-02A (Блок 4): актор — ЧЕЛОВЕК (userId), |
| `clientSessionCookieOptions` | `src/lib/client-auth.ts` | — |
| `cn` | `src/lib/utils.ts` | — |
| `computeCustomsCalculation` | `src/lib/customs.ts` | — |
| `computeWaitingLead` | `src/lib/waiting.ts` | — |
| `computeWaitingOrder` | `src/lib/waiting.ts` | — |
| `contractorActor` | `src/lib/activity.ts` | У подрядчика «имя» — companyName (люди не заведены, Г4). |
| `contractorPortalEnabled` | `src/lib/flags.ts` | ─── Функциональные флаги (серверные) ─────────────────────────────── |
| `contractorSessionCookieOptions` | `src/lib/contractor-auth.ts` | — |
| `convertCentsRub` | `src/lib/customs.ts` | Перевод суммы в копейках foreign-валюты в копейки RUB по снимку |
| `createBrokerSession` | `src/lib/broker-auth.ts` | — |
| `createBrokerUser` | `src/lib/company-users.ts` | — |
| `createCalculation` | `src/lib/customs-server.ts` | ─── POST: новый расчёт (версия) ───────────────────────────────────── |
| `createClientSession` | `src/lib/client-auth.ts` | — |
| `createContractorSession` | `src/lib/contractor-auth.ts` | — |
| `createCustomerUser` | `src/lib/company-users.ts` | — |
| `createDocumentOnDeal` | `src/lib/documents.ts` | — |
| `createEmailTransport` | `src/lib/notifications/transports/email.ts` | Фабрика email-канала. fromName/replyTo приходят в сообщении |
| `createEmployeeSession` | `src/lib/auth.ts` | — |
| `createFakeTransport` | `src/lib/notifications/transports/fake.ts` | ─── DF-03: фиктивный транспорт (e2e/CI/стенд) ──────────────────────── |
| `createOrderWithStages` | `src/lib/orders.ts` | — |
| `createTelegramTransport` | `src/lib/notifications/transports/telegram.ts` | ─── DF-03: заглушка Telegram-транспорта ───────────────────────────── |
| `createWhatsappTransport` | `src/lib/notifications/transports/whatsapp.ts` | ─── DF-03: заглушка WhatsApp-транспорта ───────────────────────────── |
| `currencyCodeSchema` | `src/lib/ref.ts` | — |
| `currencySign` | `src/lib/money.ts` | Знак для любого кода из справочника: известный символ либо сам код |
| `dateLabelFromKey` | `src/lib/notifications/owner-digest.ts` | «30.10.2026» из ключа суток '2026-10-30' (пояс рассылок — windows.ts). |
| `db` | `src/lib/db.ts` | — |
| `dealLink` | `src/lib/notifications/templates.ts` | Ссылка на сделку в кабинете получателя (§8: клиент видит свою |
| `defaultOwnerWindow` | `src/lib/notifications/owner-digest.ts` | Дефолты окна — из реестра настроек (не литералы: владелец меняет |
| `definePortal` | `src/lib/portal-auth.ts` | — |
| `deleteDocument` | `src/lib/documents.ts` | ── Удаление документа (только менеджер) ──────────────────────────── |
| `destroyBrokerSession` | `src/lib/broker-auth.ts` | — |
| `destroyClientSession` | `src/lib/client-auth.ts` | — |
| `destroyContractorSession` | `src/lib/contractor-auth.ts` | — |
| `destroySession` | `src/lib/auth.ts` | — |
| `detachBrokerFromLead` | `src/lib/broker-links.ts` | Снять связь «брокер консультирует запрос» и записать |
| `detachBrokerFromOrder` | `src/lib/broker-links.ts` | Снять видимость заявки у брокера и записать order_broker_detached. |
| `detectFamily` | `src/lib/file-signature.ts` | — |
| `diffEstimateItems` | `src/lib/brokers.ts` | — |
| `dispatchNow` | `src/lib/notifications/dispatch.ts` | Полный проход: импорт курсов ЦБ (раз в сутки, идемпотентен) + окна |
| `dispatchPendingBatch` | `src/lib/notifications/dispatch.ts` | Одна пачка: заявка → отправка вне транзакции → итог. |
| `docFileError` | `src/lib/documents.ts` | — |
| `documentEventAudience` | `src/lib/audience.ts` | Аудитория СОБЫТИЯ о документе: внутренний документ не должен даже |
| `documentVisibleToBroker` | `src/lib/documents.ts` | — |
| `documentVisibleToClient` | `src/lib/documents.ts` | — |
| `dueWindow` | `src/lib/notifications/windows.ts` | Первое окно, которое пора исполнять прямо сейчас (с учётом допуска), |
| `emitEvent` | `src/lib/events.ts` | Запись события сделки + постановка уведомлений в очередь. |
| `emitOrderEvents` | `src/lib/orders.ts` | — |
| `employeeActor` | `src/lib/activity.ts` | — |
| `enqueueNotifications` | `src/lib/notifications/enqueue.ts` | — |
| `escapeHsLike` | `src/lib/hs.ts` | Экранирование %/_/\ в строке для Prisma contains (LIKE): без этого |
| `eventWhereFor` | `src/lib/audience.ts` | Where-фрагмент для чтения ленты данным кабинетом. |
| `findOrCreateContract` | `src/lib/orders.ts` | Для новой пары рамочный договор создаётся прозрачно в момент первой |
| `findOrCreateCustomer` | `src/lib/orders.ts` | Если передан customerId — берём его. Иначе: по телефону (если указан) |
| `fmtDiffNum` | `src/lib/lead-edit.ts` | ── Форматирование значений для diff ──────────────────────────────── |
| `fmtDuty` | `src/lib/brokers.ts` | Строка «₽ / не указана» для UI обеих сторон (админка и портал). |
| `fmtPercent` | `src/lib/brokers.ts` | Проценты в человекочитаемый вид для diff и карточек: Decimal из API |
| `fmtRuDate` | `src/lib/activity.ts` | Дата для описаний событий: дд.мм.гггг по UTC. Плановые даты этапов |
| `formBool` | `src/lib/documents.ts` | Чекбокс из FormData: значения — строки 'true'/'on' либо отсутствие. |
| `formatDocSize` | `src/lib/document-constants.ts` | Человекочитаемый размер для списков (общий для трёх кабинетов). |
| `formatMoney` | `src/lib/money.ts` | «1 450 ₽» | «1 450,50 $» — детерминированный вывод для UI, ленты и |
| `formatMoneyWithVat` | `src/lib/money.ts` | Строка «1 450 ₽ · без НДС» — цена варианта/снимка с режимом НДС. |
| `formatPhoneInput` | `src/lib/phone.ts` | Маска телефона при вводе — форматирует по мере печатания |
| `formatWaitingHours` | `src/lib/waiting.ts` | Возраст мяча одним значением: «N ч» до суток, далее «N дн.» — общий |
| `getActiveCurrencyOptions` | `src/lib/ref-db.ts` | Активные валюты для форм (Combobox): из справочника; пустая таблица — |
| `getBrand` | `src/lib/brand.ts` | — |
| `getBrokerByToken` | `src/lib/broker-auth.ts` | — |
| `getClientByToken` | `src/lib/client-auth.ts` | — |
| `getClientIp` | `src/lib/login-guard.ts` | Доверенный IP клиента. |
| `getContractorByToken` | `src/lib/contractor-auth.ts` | — |
| `getCurrentBroker` | `src/lib/broker-auth.ts` | — |
| `getCurrentClient` | `src/lib/client-auth.ts` | — |
| `getCurrentContractor` | `src/lib/contractor-auth.ts` | — |
| `getCurrentEmployee` | `src/lib/auth.ts` | — |
| `getEmailSender` | `src/lib/brand.ts` | — |
| `getEmployeeByToken` | `src/lib/auth.ts` | — |
| `getIncompleteMandatoryStages` | `src/lib/orders.ts` | ─── Готовность обязательного ядра к завершению заявки (P1-05) ── |
| `getPrimaryBrokerUser` | `src/lib/company-users.ts` | — |
| `getPrimaryCustomerUser` | `src/lib/company-users.ts` | Основной пользователь — точка входа Блока 3 (перенос входа компании |
| `getSetting` | `src/lib/settings.ts` | Пустая таблица легитимна: откат на значение по умолчанию — система |
| `getSettingDef` | `src/lib/settings.ts` | Свободные ключи не допускаются: пишем только то, что знает экран |
| `getTransport` | `src/lib/notifications/channel.ts` | ─── DF-03: выбор транспорта по каналу письма ──────────────────────── |
| `groupSlowingOrders` | `src/lib/pulse.ts` | Группировка активных заявок по waitingOnKind (DF-05). NULL waitingSince |
| `halfUpDiv` | `src/lib/customs.ts` | half-up деление BigInt (делимое любого знака) |
| `hashPassword` | `src/lib/password.ts` | — |
| `hashSessionToken` | `src/lib/portal-auth.ts` | — |
| `hsPrefixRange` | `src/lib/hs.ts` | Границы префиксного поиска по индексу (btree): code >= gte AND |
| `importCbrRates` | `src/lib/cbr.ts` | Импорт курсов за последний доступный день. Возвращается число |
| `incotermMetaOf` | `src/lib/ref.ts` | — |
| `isActiveOrderStatus` | `src/lib/pulse.ts` | — |
| `isChoiceFollowupDue` | `src/lib/waiting.ts` | — |
| `isCurrencyCode` | `src/lib/money.ts` | — |
| `isEmail` | `src/lib/phone.ts` | Проверка: это email? |
| `isHsCodeQuery` | `src/lib/hs.ts` | Цифровой запрос → поиск по префиксу кода; есть буквы → по названию. |
| `isHsValidOn` | `src/lib/hs.ts` | «Код действовал на дату»: validFrom <= date < validTo (или бессрочно). |
| `isLeadAnketaEditable` | `src/lib/lead-edit.ts` | Окно правки анкеты (P1-02): new/calculated. won — история (правится |
| `isManualRate` | `src/lib/brokers.ts` | Строка с нестандартной ставкой (rateNote заполнен) считается брокером |
| `isPhoneNormalized` | `src/lib/phone.ts` | Проверка: это нормализованный телефон? (+7XXXXXXXXXX) |
| `isRefDir` | `src/lib/ref.ts` | — |
| `isSqliteDatabase` | `src/lib/list-query.ts` | — |
| `isStaffOnlyRow` | `src/lib/activity.ts` | Заметка (и другое staff-only событие) — для UI-пометок. Функция в |
| `isStageMandatory` | `src/lib/orders.ts` | — |
| `isStageOverdue` | `src/lib/waiting.ts` | «Просрочка» плана этапа — ТА ЖЕ семантика, что на «Требует внимания» |
| `isValidEmail` | `src/lib/phone.ts` | Проверка: это email (строгая)? |
| `isVatMode` | `src/lib/money.ts` | — |
| `joinRouteText` | `src/lib/route-fields.ts` | Обратная сборка для показа/редактирования: «Страна, город» / «Город» / |
| `listCalculations` | `src/lib/customs-server.ts` | ─── Чтение: история расчётов сделки (новые сверху) ────────────────── |
| `listRefItems` | `src/lib/ref-db.ts` | — |
| `loadFeeRows` | `src/lib/customs-server.ts` | ─── Действующая редакция шкалы сборов (validFrom ≤ даты расчёта) ──── |
| `loadPulseCore` | `src/lib/pulse-db.ts` | — |
| `logDocumentVersionAdded` | `src/lib/documents.ts` | Событие о новой версии — отдельно от транзакции (лента — наблюдение, |
| `logInternalNote` | `src/lib/activity.ts` | — |
| `maskPII` | `src/lib/notifications/mask.ts` | — |
| `masterLandingPath` | `src/lib/pulse.ts` | ─── Вход мастера открывает Пульс (карточка: «вход мастера открывает |
| `matchHsName` | `src/lib/hs.ts` | Фильтр по названию (регистр не важен). В БД то же самое делает |
| `matchRefOptions` | `src/lib/ref.ts` | Регистронезависимо: «кит» находит Китай; «CN»/«cn» — по коду; |
| `mergeLeadCargo` | `src/lib/lead-edit.ts` | Полная замена известных полей анкеты груза с сохранением неизвестных |
| `mergeTransportChips` | `src/lib/contractors.ts` | Слияние при записи чипов компетенций: менеджер переключает только |
| `moneyAmount` | `src/lib/money.ts` | ─── zod-помощник для денежных полей API (P1-04) ─────────────────── |
| `mskToday` | `src/lib/cbr.ts` | Сегодняшняя дата в Москве (yyyy-mm-dd): курс считается «у нас» по МСК — |
| `nearestUnfinishedStage` | `src/lib/waiting.ts` | Ближайший незавершённый этап = первый по sequence со статусом != done |
| `nextWindowTime` | `src/lib/notifications/windows.ts` | Ближайшее время СЛЕДУЮЩЕГО окна (для отложенных «красных» сверх |
| `normalizeHsQuery` | `src/lib/hs.ts` | Нормализация запроса: пробелы/дефисы/точки выкидываются («0101 21» и |
| `normalizePhone` | `src/lib/phone.ts` | Нормализация телефона в формат +7XXXXXXXXXX |
| `normalizeRefCode` | `src/lib/ref.ts` | Нормализация кода при записи/поиске: страны и валюты — ISO верхний |
| `nowInZone` | `src/lib/notifications/windows.ts` | Текущее «настенное» время в поясе IANA. |
| `orderOrderBy` | `src/lib/orders.ts` | — |
| `ownerDedupKey` | `src/lib/notifications/owner-digest.ts` | — |
| `ownerDigestDecision` | `src/lib/notifications/owner-digest.ts` | Решение прохода для одного мастера: 'window' — пора (внутри окна), |
| `parseCbrNumber` | `src/lib/cbr.ts` | Строгое число из формата ЦБ: «79,7653» / «1 234,56» → number; мусор → null. |
| `parseCbrXml` | `src/lib/cbr.ts` | Разбор XML без зависимостей (нулевая поверхность атаки вместо парсера): |
| `parseDocumentCreateForm` | `src/lib/documents.ts` | — |
| `parseDocumentVersionForm` | `src/lib/documents.ts` | — |
| `parseEmployeeRoles` | `src/lib/employees.ts` | Безопасный разбор Employee.roles: битый JSON не должен ронять роуты |
| `parseListQuery` | `src/lib/list-query.ts` | Парсинг параметров списка. Возвращает ошибку (строкой — роут отдаст |
| `parseMoneyInput` | `src/lib/money.ts` | Разбор ввода менеджера: «1 450,50» / «1450.5» / «1 450» → число; |
| `parseOwnerWindow` | `src/lib/notifications/owner-digest.ts` | Окно валидно, если обе границы распознаны и end позже start (подсказка |
| `parseRouteText` | `src/lib/route-fields.ts` | ── Разбор свободного «Страна, город» ─────────────────────────────── |
| `parseTimeToMinutes` | `src/lib/notifications/windows.ts` | — |
| `participantsOf` | `src/lib/participants.ts` | Единая точка входа: ref.orderId либо ref.leadId (ровно один). |
| `participantsOfLead` | `src/lib/participants.ts` | Участники запроса (Lead): до конвертации клиент может отсутствовать |
| `participantsOfOrder` | `src/lib/participants.ts` | Участники заявки (Order): ответственный, клиент, брокеры, подрядчики |
| `percentValue` | `src/lib/brokers.ts` | Проценты — Decimal (RULES 2.15), «разумные границы» карточки: 0..100, |
| `phoneVariants` | `src/lib/phone.ts` | Телефонные варианты поискового запроса (Ж7, переиспользован Ж6а). |
| `pickFeeRub` | `src/lib/customs.ts` | — |
| `planHsImport` | `src/lib/hs.ts` | Решение импорта по версиям (карточка: «импорт повторно не дублирует», |
| `processOwnerDigest` | `src/lib/notifications/owner-digest.ts` | — |
| `processRegularDigests` | `src/lib/notifications/digest.ts` | — |
| `projectActorName` | `src/lib/actor-name.ts` | ── Правило проекции (чистая функция) ─────────────────────────────── |
| `projectActors` | `src/lib/actor-name.ts` | Лента событий (Activity): actorName → проекция. |
| `projectAuthors` | `src/lib/actor-name.ts` | Плоские строки версий (DocumentVersion): authorName → проекция. |
| `projectDocumentAuthors` | `src/lib/actor-name.ts` | Список документов: authorName во ВСЕХ версиях каждого документа, |
| `readApiResponse` | `src/lib/api-client.ts` | — |
| `readAppBaseUrl` | `src/lib/notifications/templates.ts` | — |
| `readCalcInput` | `src/lib/customs-api.ts` | — |
| `readDocFile` | `src/lib/documents.ts` | Читает файл и проверяет сигнатуру. null — содержимое не прошло проверку. */ |
| `readEmailProvider` | `src/lib/notifications/transports/email.ts` | — |
| `readInfoString` | `src/lib/contractors.ts` | Толерантное чтение строковых полей анкеты (directions и пр.). |
| `readLeadCargo` | `src/lib/leads.ts` | — |
| `readPermits` | `src/lib/brokers.ts` | ─── Конвенции Json для UI (по образцу mergeTransportChips Г5) ──── |
| `readTransportChips` | `src/lib/contractors.ts` | Толерантное чтение массива видов транспорта: не массив / не строки — |
| `readyDateInput` | `src/lib/route-fields.ts` | Готовность к отгрузке: строка yyyy-mm-dd → UTC-полночь (даты бланка — |
| `recipientsOfBroker` | `src/lib/participants.ts` | Адресаты брокера (DF-03): зеркало recipientsOfCustomer — активные |
| `recipientsOfCustomer` | `src/lib/participants.ts` | ─── Получатели клиента (единственная точка изменения, DF-03) ──────── |
| `recomputeAfterEvent` | `src/lib/waiting-db.ts` | Пересчёт по цели события (вызывается из emitEvent). Событие ЛИДА |
| `recomputeWaitingLead` | `src/lib/waiting-db.ts` | — |
| `recomputeWaitingOrder` | `src/lib/waiting-db.ts` | — |
| `recordLoginAttempt` | `src/lib/login-guard.ts` | — |
| `refCodeField` | `src/lib/ref.ts` | — |
| `renderFooter` | `src/lib/notifications/templates.ts` | Подвал: название и подпись — настройки; отключение — ответ на письмо |
| `renderSingleLetter` | `src/lib/notifications/templates.ts` | Одиночное письмо по событию. Нейтральный вариант (аудит №16) не |
| `requireBroker` | `src/lib/broker-auth.ts` | Единственный способ проверить брокера в роутах кабинета; опций нет — |
| `requireCalcWriter` | `src/lib/customs-api.ts` | — |
| `requireClient` | `src/lib/client-auth.ts` | Единственный способ проверить клиента в роутах кабинета; опций нет — |
| `requireContractor` | `src/lib/contractor-auth.ts` | Единственный способ проверить подрядчика в роутах кабинета; опций нет — |
| `requireEmployee` | `src/lib/auth.ts` | — |
| `requisitesInn` | `src/lib/requisite-fields.ts` | ИНН — главный реквизит для строки списка (идентифицирует юрлицо |
| `resetSetting` | `src/lib/settings.ts` | «Сбросить» на экране настроек: строка удаляется, getSetting возвращается |
| `resolveActiveCurrencies` | `src/lib/ref-db.ts` | Валидация валют схемы (QuoteOption/QuoteSnapshot): коды должны быть |
| `resolveActiveRefs` | `src/lib/ref-db.ts` | — |
| `resolveDealCodes` | `src/lib/ref-db.ts` | — |
| `resolveFileMime` | `src/lib/file-signature.ts` | — |
| `resolveRecipients` | `src/lib/notifications/rules.ts` | — |
| `resolveRouteColumns` | `src/lib/ref-db.ts` | ─── Маршрут + справочник: колонки для prisma одним вызовом ───────── |
| `resolveUserNames` | `src/lib/actor-name.ts` | ── Батч-резолв пользователей ─────────────────────────────────────── |
| `retryNotification` | `src/lib/notifications/retry.ts` | — |
| `routeToDbColumns` | `src/lib/route-fields.ts` | RouteFieldsInput → данные для prisma create/update (readyDate — Date, |
| `sanitizeFileName` | `src/lib/documents.ts` | Санитизация имени: без каталогов, без управляющих символов, без |
| `scheduleDispatch` | `src/lib/notifications/dispatch.ts` | Немедленная попытка диспетчера после коммита write-операции |
| `searchHsCodes` | `src/lib/hs-db.ts` | Поиск: цифровой запрос — префикс кода (btree-диапазон), иначе — |
| `sessionCookieOptions` | `src/lib/auth.ts` | — |
| `setBrokerUserActive` | `src/lib/company-users.ts` | — |
| `setCustomerUserActive` | `src/lib/company-users.ts` | Деактивация закрывает сессии пользователя немедленно (по образцу |
| `setSetting` | `src/lib/settings.ts` | Актёр — тот, кто сохранил (мастер; API Блока 4 передаёт employeeActor). |
| `stageVisual` | `src/lib/stage-visuals.ts` | — |
| `suggestOrderStatus` | `src/lib/status-suggest.ts` | — |
| `summarizeOrderStages` | `src/lib/order-summary.ts` | Этапы заявки (по sequence asc) → сводка: первый незавершённый этап |
| `todayUtcMidnight` | `src/lib/order-summary.ts` | Граница «сегодня» по UTC: плановые даты приходят UTC-полуночью |
| `topSlowingRows` | `src/lib/notifications/owner-digest.ts` | Топ-5 «тормозящих» для письма: самые старые мячи по всем группам |
| `unauthorized` | `src/lib/portal-auth.ts` | — |
| `updateBrokerUser` | `src/lib/company-users.ts` | — |
| `updateCalculation` | `src/lib/customs-server.ts` | ─── PUT: правка черновика (только актуальной версии) ──────────────── |
| `updateCustomerUser` | `src/lib/company-users.ts` | — |
| `utcDayStart` | `src/lib/order-summary.ts` | — |
| `validateAssigneeChange` | `src/lib/lead-edit.ts` | — |
| `verifyPassword` | `src/lib/password.ts` | — |
| `windowKeyOf` | `src/lib/notifications/windows.ts` | Ключ окна: «yyyy-mm-dd:HH:MM» в поясе рассылок (Notification.windowKey, |
| `zonedWallTimeToUtc` | `src/lib/notifications/windows.ts` | Двухпроходное преобразование «настенное время в поясе» → UTC Date |

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
| `BrokerUsersDialog` | `src/components/admin/BrokerUsersDialog.tsx` |
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
| `CustomerUserDialog` | `src/components/admin/CustomerUserDialog.tsx` |
| `CustomersList` | `src/components/admin/CustomersList.tsx` |
| `CustomsAllocationSelects` | `src/components/admin/customs/CustomsAllocationSelects.tsx` |
| `CustomsCalcForm` | `src/components/admin/customs/CustomsCalcForm.tsx` |
| `CustomsCalcResult` | `src/components/admin/customs/CustomsCalcResult.tsx` |
| `CustomsCalcScreen` | `src/components/admin/customs/CustomsCalcScreen.tsx` |
| `CustomsFxInputs` | `src/components/admin/customs/CustomsFxInputs.tsx` |
| `CustomsItemsEditor` | `src/components/admin/customs/CustomsItemsEditor.tsx` |
| `EMPTY_OPTION_FORM` | `src/components/admin/QuoteOptionFormFields.tsx` |
| `EmployeeCard` | `src/components/admin/employee/EmployeeCard.tsx` |
| `EmployeeCreateDialog` | `src/components/admin/employee/EmployeeCreateDialog.tsx` |
| `EmployeeEditDialog` | `src/components/admin/employee/EmployeeEditDialog.tsx` |
| `EmployeeResetPasswordDialog` | `src/components/admin/employee/EmployeeResetPasswordDialog.tsx` |
| `EmployeesList` | `src/components/admin/EmployeesList.tsx` |
| `EstimateView` | `src/components/admin/estimate/EstimateView.tsx` |
| `GlobalSearch` | `src/components/admin/GlobalSearch.tsx` |
| `HiddenMore` | `src/components/admin/HiddenMore.tsx` |
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
| `NotificationsJournal` | `src/components/admin/NotificationsJournal.tsx` |
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
| `PulseCargoBlock` | `src/components/admin/pulse/PulseCargoBlock.tsx` |
| `PulseEventsBlock` | `src/components/admin/pulse/PulseEventsBlock.tsx` |
| `PulseScreen` | `src/components/admin/pulse/PulseScreen.tsx` |
| `PulseSlowingBlock` | `src/components/admin/pulse/PulseSlowingBlock.tsx` |
| `QuoteOptionDialog` | `src/components/admin/QuoteOptionDialog.tsx` |
| `QuoteOptionsSection` | `src/components/admin/QuoteOptionsSection.tsx` |
| `RawInfoView` | `src/components/admin/contractorlead/RawInfoView.tsx` |
| `RefDialog` | `src/components/admin/references/RefDialog.tsx` |
| `ReferencesScreen` | `src/components/admin/references/ReferencesScreen.tsx` |
| `RequisitesFields` | `src/components/admin/legalentity/RequisitesFields.tsx` |
| `RoleChips` | `src/components/admin/employee/RoleChips.tsx` |
| `SettingsPanel` | `src/components/admin/SettingsPanel.tsx` |
| `SideActivityFeed` | `src/components/admin/SideActivityFeed.tsx` |
| `StageCard` | `src/components/admin/order/StageCard.tsx` |
| `StageCatalogList` | `src/components/admin/StageCatalogList.tsx` |
| `StageCreateDialog` | `src/components/admin/stagecatalog/StageCreateDialog.tsx` |
| `StageEditDialog` | `src/components/admin/stagecatalog/StageEditDialog.tsx` |
| `StageSection` | `src/components/admin/attention/AttentionSections.tsx` |
| `StatusSuggestion` | `src/components/admin/order/StatusSuggestion.tsx` |
| `TYPE_LABEL` | `src/components/admin/ActivityEventList.tsx` |
| `TransportChips` | `src/components/admin/contractorlead/TransportChips.tsx` |
| `WaitingBadge` | `src/components/admin/WaitingBadge.tsx` |

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
| `BrokerUserForm` | `src/components/admin/broker/BrokerUserForm.tsx` |
| `EMPTY_ITEM` | `src/components/broker/estimate/ItemsEditor.tsx` |
| `PermitsEditor` | `src/components/broker/estimate/FormBlocks.tsx` |

### src/components/client

| Компонент | Файл |
|---|---|
| `ClientHome` | `src/components/client/ClientHome.tsx` |
| `ClientLeadCard` | `src/components/client/ClientLeadCard.tsx` |
| `ClientLeadCreateDialog` | `src/components/client/ClientLeadCreateDialog.tsx` |
| `ClientLogoutButton` | `src/components/client/ClientLogoutButton.tsx` |
| `ClientOrderCard` | `src/components/client/ClientOrderCard.tsx` |
| `ClientOrderStatusBadge` | `src/components/client/ClientBadges.tsx` |

### src/components/components

| Компонент | Файл |
|---|---|
| `ComboOptionRow` | `src/components/references/ComboOptionRow.tsx` |
| `HsCodeCombobox` | `src/components/references/HsCodeCombobox.tsx` |
| `IncotermPicker` | `src/components/references/IncotermPicker.tsx` |
| `ReferenceCombobox` | `src/components/references/ReferenceCombobox.tsx` |

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
| GET, PATCH, POST | `/api/admin/brokers/{id}/users` | admin | employee | write | нет |
| GET, POST | `/api/admin/contractor-leads` | admin | employee | write | нет |
| DELETE, GET, PATCH | `/api/admin/contractor-leads/{id}` | admin | employee | write | нет |
| GET | `/api/admin/contractors` | admin | employee | — | нет |
| PATCH | `/api/admin/contractors/{id}` | admin | employee | write | нет |
| GET | `/api/admin/contracts` | admin | employee | — | нет |
| GET, POST | `/api/admin/customers` | admin | employee | write | нет |
| GET | `/api/admin/customers/{id}` | admin | employee | — | нет |
| GET, PATCH, POST | `/api/admin/customers/{id}/access` | admin | employee | write | нет |
| PUT | `/api/admin/customs-calculations/{id}` | admin | — | — | нет |
| DELETE | `/api/admin/documents/{id}` | admin | employee | write | нет |
| POST | `/api/admin/documents/{id}/versions` | admin | employee | write | нет |
| GET, POST | `/api/admin/employees` | admin | employee | — | нет |
| PATCH | `/api/admin/employees/{id}` | admin | employee | — | нет |
| GET, POST | `/api/admin/leads` | admin | employee | write | нет |
| DELETE, GET, PATCH | `/api/admin/leads/{id}` | admin | employee | write | нет |
| POST | `/api/admin/leads/{id}/brokers` | admin | employee | write | нет |
| DELETE | `/api/admin/leads/{id}/brokers/{brokerId}` | admin | employee | write | нет |
| POST | `/api/admin/leads/{id}/convert` | admin | employee | write | нет |
| GET, POST | `/api/admin/leads/{id}/customs-calculations` | admin | employee | — | нет |
| GET, POST | `/api/admin/leads/{id}/documents` | admin | employee | write | нет |
| POST | `/api/admin/leads/{id}/notes` | admin | employee | write | нет |
| POST | `/api/admin/leads/{id}/options` | admin | employee | write | нет |
| GET, POST | `/api/admin/legal-entities` | admin | employee | — | нет |
| PATCH | `/api/admin/legal-entities/{id}` | admin | employee | — | нет |
| GET | `/api/admin/notifications` | admin | employee | — | нет |
| POST | `/api/admin/notifications/{id}/retry` | admin | employee | — | нет |
| DELETE, PATCH | `/api/admin/options/{id}` | admin | employee | write | нет |
| GET, POST | `/api/admin/orders` | admin | employee | write | нет |
| GET, PATCH | `/api/admin/orders/{id}` | admin | employee | write | нет |
| POST | `/api/admin/orders/{id}/brokers` | admin | employee | write | нет |
| DELETE | `/api/admin/orders/{id}/brokers/{brokerId}` | admin | employee | write | нет |
| GET, POST | `/api/admin/orders/{id}/customs-calculations` | admin | employee | — | нет |
| GET, POST | `/api/admin/orders/{id}/documents` | admin | employee | write | нет |
| POST | `/api/admin/orders/{id}/notes` | admin | employee | write | нет |
| POST | `/api/admin/orders/{id}/stages` | admin | employee | write | нет |
| DELETE, PATCH | `/api/admin/orders/{id}/stages/{stageId}` | admin | employee | write | нет |
| GET | `/api/admin/pulse` | admin | employee | — | нет |
| GET, POST | `/api/admin/references` | admin | employee | write | нет |
| PATCH | `/api/admin/references/{id}` | admin | employee | write | нет |
| GET | `/api/admin/search` | admin | employee | — | нет |
| DELETE, GET, PATCH | `/api/admin/settings` | admin | employee | — | нет |
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
| GET | `/api/hs/search` | public | — | — | нет |
| POST | `/api/internal/notifications/dispatch` | public | — | — | нет |
| GET | `/api/ref/{dir}` | public | — | — | нет |

## Модели Prisma

| Модель | Полей | Где используется |
|---|---|---|
| `Activity` | 16 | src/app/admin/(dashboard)/page.tsx, src/app/api/admin/pulse/route.ts, src/lib/activity.ts, src/lib/notifications/digest.ts |
| `Broker` | 13 | src/app/api/admin/brokers/[id]/route.ts, src/app/api/admin/brokers/[id]/users/route.ts, src/app/api/admin/brokers/route.ts, src/app/api/admin/leads/[id]/brokers/route.ts, src/app/api/admin/orders/[id]/brokers/route.ts |
| `BrokerEstimate` | 11 | src/app/api/broker/leads/[id]/estimate/route.ts |
| `BrokerEstimateItem` | 12 | — |
| `BrokerSession` | 8 | src/lib/broker-auth.ts |
| `BrokerUser` | 12 | src/app/api/admin/brokers/[id]/users/route.ts, src/app/api/auth/broker/login/route.ts, src/lib/actor-name.ts, src/lib/company-users.ts |
| `ClientSession` | 8 | src/lib/client-auth.ts |
| `Contract` | 9 | src/app/api/admin/contracts/route.ts |
| `Contractor` | 15 | src/app/api/admin/contractor-leads/[id]/route.ts, src/app/api/admin/contractors/[id]/route.ts, src/app/api/admin/contractors/route.ts, src/app/api/admin/orders/[id]/stages/[stageId]/route.ts, src/app/api/auth/contractor/login/route.ts |
| `ContractorLead` | 9 | src/app/api/admin/contractor-leads/[id]/route.ts, src/app/api/admin/contractor-leads/route.ts |
| `ContractorSession` | 6 | src/lib/contractor-auth.ts |
| `CurrencyRate` | 6 | src/app/api/admin/references/route.ts, src/lib/cbr.ts, src/lib/customs-server.ts |
| `Customer` | 12 | src/app/api/admin/customers/[id]/access/route.ts, src/app/api/admin/customers/[id]/route.ts, src/app/api/admin/customers/route.ts, src/app/api/admin/leads/route.ts, src/app/api/admin/orders/route.ts |
| `CustomerUser` | 12 | src/app/api/admin/customers/[id]/access/route.ts, src/app/api/auth/client/login/route.ts, src/lib/actor-name.ts, src/lib/company-users.ts |
| `CustomsCalculation` | 28 | src/app/admin/orders/[id]/print/page.tsx, src/lib/customs-server.ts |
| `CustomsCalculationItem` | 17 | — |
| `CustomsFeeScale` | 5 | scripts/seed.ts, src/lib/customs-server.ts |
| `Document` | 12 | src/app/api/admin/documents/[id]/versions/route.ts, src/app/api/admin/leads/[id]/documents/route.ts, src/app/api/admin/orders/[id]/documents/route.ts, src/app/api/broker/leads/[id]/documents/route.ts, src/app/api/broker/orders/[id]/documents/route.ts, src/app/api/client/leads/[id]/documents/route.ts (+2) |
| `DocumentVersion` | 13 | src/app/api/document-versions/[id]/file/route.ts |
| `Employee` | 11 | scripts/seed.ts, scripts/set-master-password.ts, src/app/api/admin/employees/[id]/route.ts, src/app/api/admin/employees/route.ts, src/app/api/admin/orders/[id]/patch.ts, src/app/api/auth/employee/login/route.ts (+2) |
| `EmployeeSession` | 6 | src/app/api/admin/employees/[id]/route.ts, src/lib/auth.ts |
| `HsCode` | 9 | scripts/import-hs.ts, scripts/verify-hs-db.ts, scripts/verify-hs-prefix.ts, src/app/api/broker/leads/[id]/estimate/route.ts, src/lib/hs-db.ts |
| `HsImport` | 5 | scripts/import-hs.ts, scripts/verify-hs-db.ts, src/lib/hs-db.ts |
| `Lead` | 35 | scripts/backfill_waiting.ts, scripts/e2e_backdate_waiting.ts, src/app/admin/(dashboard)/layout.tsx, src/app/api/admin/attention/route.ts, src/app/api/admin/leads/[id]/brokers/[brokerId]/route.ts, src/app/api/admin/leads/[id]/brokers/route.ts (+17) |
| `LeadBroker` | 7 | src/app/api/admin/leads/[id]/brokers/route.ts, src/app/api/broker/leads/[id]/documents/route.ts, src/app/api/broker/leads/[id]/estimate/route.ts, src/app/api/broker/leads/[id]/route.ts, src/app/api/broker/leads/route.ts, src/lib/broker-links.ts |
| `LegalEntity` | 7 | scripts/seed.ts, src/app/api/admin/leads/[id]/convert/route.ts, src/app/api/admin/legal-entities/[id]/route.ts, src/app/api/admin/legal-entities/route.ts |
| `LoginAttempt` | 7 | src/lib/login-guard.ts |
| `Notification` | 19 | scripts/e2e_seed_notification.ts, src/app/api/admin/attention/route.ts, src/app/api/admin/notifications/route.ts, src/lib/notifications/digest.ts, src/lib/notifications/dispatch.ts, src/lib/notifications/owner-digest.ts (+1) |
| `NotificationPreference` | 5 | — |
| `Order` | 43 | scripts/backfill_waiting.ts, src/app/admin/(dashboard)/layout.tsx, src/app/admin/orders/[id]/print/page.tsx, src/app/api/admin/attention/route.ts, src/app/api/admin/orders/[id]/brokers/route.ts, src/app/api/admin/orders/[id]/customs-calculations/route.ts (+19) |
| `OrderBroker` | 6 | src/app/api/admin/orders/[id]/brokers/route.ts, src/app/api/broker/orders/[id]/documents/route.ts, src/lib/broker-links.ts |
| `OrderStageCatalog` | 5 | scripts/seed.ts, src/app/api/admin/attention/route.ts, src/app/api/admin/customers/[id]/route.ts, src/app/api/admin/orders/[id]/route.ts, src/app/api/admin/orders/[id]/stages/[stageId]/route.ts, src/app/api/admin/orders/[id]/stages/route.ts (+12) |
| `OrderStageInstance` | 11 | src/app/api/admin/orders/[id]/stages/[stageId]/route.ts, src/app/api/admin/orders/[id]/stages/route.ts, src/app/api/contractor/orders/[id]/stages/[stageId]/route.ts, src/lib/orders.ts |
| `QuoteOption` | 14 | src/app/api/admin/leads/[id]/patch.ts, src/app/api/admin/options/[id]/route.ts |
| `RefItem` | 10 | scripts/seed.ts, src/app/api/admin/references/[id]/route.ts, src/app/api/admin/references/route.ts, src/lib/ref-db.ts |
| `Setting` | 4 | src/app/api/admin/settings/route.ts, src/lib/settings.ts |

## Переменные окружения

| Переменная | Файлов с использованием | .env.example | DEPLOY.md |
|---|---|---|---|
| `ADMIN_PASSWORD` | 3 | да | да |
| `ADMIN_PHONE` | 3 | да | да |
| `APP_BASE_URL` | 1 | да | да |
| `BASE_URL` | 3 | да | да |
| `CBR_IMPORT` | 2 | да | да |
| `CBR_RATE_URL` | 1 | да | да |
| `CONTRACTOR_PORTAL_ENABLED` | 1 | да | да |
| `CRON_SECRET` | 2 | да | да |
| `DATABASE_URL` | 6 | да | да |
| `DISABLE_RATE_LIMIT` | 2 | да | да |
| `EMAIL_ALLOWLIST` | 2 | да | да |
| `EMAIL_FROM` | 1 | да | да |
| `EMAIL_PROVIDER` | 2 | да | да |
| `MASTER_PASSWORD` | 2 | да | да |
| `MASTER_PHONE` | 2 | да | да |
| `NODE_ENV` | 3 | — | да |
| `RESEND_API_KEY` | 1 | да | да |
| `SHADOW_URL` | 1 | — | да |
| `TRUSTED_PROXY` | 1 | да | да |
| `VERCEL` | 1 | да | да |
| `VERCEL_ENV` | 1 | да | да |
| `VERCEL_GIT_COMMIT_SHA` | 1 | да | да |
| `VITEST` | 1 | да | да |

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
