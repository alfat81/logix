import type { Audience } from '@/lib/audience'
// Только ТИПЫ — value-импорт создал бы цикл activity ↔ events
// (activity.ts вызывает emitEvent). `import type` стирается компилятором.
import type { ActivityActor, ActivityTarget, ActivityType } from '@/lib/activity'

// ─── DF-01 «События как ось»: реестр EVENT_TYPES ─────────────────────
// Ось системы (D29): события сделки пишутся ТОЛЬКО через emitEvent()
// (lib/events.ts). Ленты кабинетов, Пульс (DF-07), уведомления (DF-03)
// и сводка (DF-08) строятся поверх одного журнала Activity.
//
// Реестр живёт ОТДЕЛЬНЫМ файлом (v0.6.5): правила уведомлений DF-03
// (lib/notifications/rules.ts) читают его как value, а events.ts
// принимает от enqueue обратный вызов — прямой value-импорт events ↔
// rules дал бы цикл (events → enqueue → rules → events). Файл без
// серверных зависимостей: только типы и константы.

// Кто получит уведомление (DF-03, матрица §8 ROADMAP-DEALFLOW; точные
// тексты и каналы уточняются O-4 в карточке DF-03 — здесь фиксируется
// ПРАВИЛО, диспетчер писем его реализует):
// - responsible — ответственному менеджеру (нет — активным мастерам);
// - responsible-if-not-actor — ответственному, если менял не он сам;
// - responsible-if-external-actor — ответственному, если действовал
//   клиент или брокер (сотрудник сам видит факт в ленте);
// - new-assignee — НОВОМУ ответственному при назначении/смене;
// - client — клиенту сделки;
// - client-neutral — клиенту в нейтральной формулировке («задержка на
//   этапе», не «проблема» — находка аудита №16);
// - broker — подключённому брокеру;
// - client-broker-if-visible — клиенту и брокеру, если видят документ.
export type NotifyRule =
  | 'responsible'
  | 'responsible-if-not-actor'
  | 'responsible-if-external-actor'
  | 'new-assignee'
  | 'client'
  | 'client-neutral'
  | 'broker'
  | 'client-broker-if-visible'

// Метаданные типа события: подпись (подпись письма/фильтры), аудитория
// по умолчанию и правила уведомления. Реестр живёт РЯДОМ с
// ACTIVITY_TYPES (lib/activity.ts — источник union-типа ActivityType):
// Record<ActivityType, …> проверяет компилятором полноту — новый код
// события не добавится без метаданных, дубликата нет.
export type EventMeta = {
  label: string
  audience: Audience[]
  notify: NotifyRule[]
}

export const EVENT_TYPES: Record<ActivityType, EventMeta> = {
  // воронка запросов
  lead_created: { label: 'Запрос создан', audience: ['staff', 'client'], notify: ['responsible'] },
  lead_status_changed: { label: 'Статус запроса изменён', audience: ['staff', 'client'], notify: [] },
  lead_assignee_changed: { label: 'Ответственный изменён', audience: ['staff', 'client'], notify: ['new-assignee'] },
  lead_edited: { label: 'Запрос отредактирован', audience: ['staff', 'client'], notify: [] },
  lead_converted: { label: 'Запрос сконвертирован в заявку', audience: ['staff', 'client'], notify: [] },
  // DF-27 волна 2 (Р-3, D75): печатные редакции заявки. staff-аудитория
  // (риски §15: событийный шум клиенту — без писем; клиент видит
  // редакции и статусы подтверждений в карточке своего запроса)
  lead_print_revision_created: { label: 'Сформирована печатная редакция заявки', audience: ['staff'], notify: [] },
  lead_print_revision_confirmed: { label: 'Печатная редакция подтверждена стороной', audience: ['staff'], notify: [] },
  // Поток A волна 1 (BL-3/BL-2): согласование расчёта. Письмо —
  // ответственному, если действовал клиент (сам факт сотрудник видит
  // в ленте); сброс — письмо клиенту (ему предстоит повторное
  // согласование — плана ред. 3 §2.3).
  lead_client_confirmed: { label: 'Вариант согласован клиентом', audience: ['staff', 'client'], notify: ['responsible-if-external-actor'] },
  lead_confirmation_reset: { label: 'Согласование сброшено — условия изменены', audience: ['staff', 'client'], notify: ['client'] },
  option_added: { label: 'Добавлен вариант расчёта', audience: ['staff', 'client'], notify: [] },
  option_updated: { label: 'Вариант расчёта обновлён', audience: ['staff', 'client'], notify: [] },
  option_selected: { label: 'Выбран вариант расчёта', audience: ['staff', 'client'], notify: [] },
  option_removed: { label: 'Вариант расчёта удалён', audience: ['staff', 'client'], notify: [] },
  // заявки
  order_created: { label: 'Заявка создана', audience: ['staff', 'client'], notify: [] },
  order_status_changed: { label: 'Статус заявки изменён', audience: ['staff', 'client'], notify: ['responsible-if-not-actor', 'client'] },
  order_assignee_changed: { label: 'Ответственный по заявке изменён', audience: ['staff', 'client'], notify: ['new-assignee'] },
  order_cargo_changed: { label: 'Груз изменён', audience: ['staff', 'client'], notify: [] },
  order_quote_changed: { label: 'Условия расчёта изменены', audience: ['staff', 'client'], notify: [] },
  order_fields_changed: { label: 'Поля заявки изменены', audience: ['staff', 'client'], notify: [] },
  // этапы
  stage_added: { label: 'Этап добавлен', audience: ['staff', 'client'], notify: [] },
  // правило зависит от ЦЕЛЕВОГО статуса (done → client; problem →
  // responsible + client-neutral) — решают правила DF-03 по данным
  // (lib/notifications/rules.ts читает статус этапа), реестр статично
  // статусы не знает.
  stage_status_changed: { label: 'Статус этапа изменён', audience: ['staff', 'client'], notify: [] },
  // Имя подрядчика в description — клиенту/брокеру не отдаём
  // (глоссарий RULES 2.6: Contractor — не показываем).
  stage_contractor_changed: { label: 'Исполнитель этапа изменён', audience: ['staff'], notify: [] },
  stage_planned_changed: { label: 'План этапа изменён', audience: ['staff', 'client'], notify: [] },
  stage_updated: { label: 'Этап обновлён', audience: ['staff', 'client'], notify: [] },
  stage_removed: { label: 'Этап удалён', audience: ['staff', 'client'], notify: [] },
  // DF-14: обход блокировки чек-листа (мастер, override + комментарий).
  // staff-only: причина обхода — внутренняя; клиенту достаточно
  // stage_status_changed «этап завершён».
  stage_done_overridden: { label: 'Завершение этапа перекрыто мастером', audience: ['staff'], notify: [] },
  // подрядчики — внутренний контур (кабинет заморожен, D31)
  contractor_created: { label: 'Перевозчик добавлен', audience: ['staff'], notify: [] },
  contractor_updated: { label: 'Данные перевозчика обновлены', audience: ['staff'], notify: [] },
  contractor_pool_changed: { label: 'Пул перевозчиков изменён', audience: ['staff'], notify: [] },
  contractor_password_changed: { label: 'Пароль ЛК перевозчика обновлён', audience: ['staff'], notify: [] },
  // брокеры (Д)
  lead_broker_attached: { label: 'Брокер подключён к запросу', audience: ['staff', 'broker'], notify: ['broker'] },
  lead_broker_detached: { label: 'Брокер отключён от запроса', audience: ['staff', 'broker'], notify: [] },
  order_broker_attached: { label: 'Брокер подключён к заявке', audience: ['staff', 'broker'], notify: ['broker'] },
  order_broker_detached: { label: 'Брокер отключён от заявки', audience: ['staff', 'broker'], notify: [] },
  broker_estimate_changed: { label: 'Оценка таможенных платежей изменена', audience: ['staff', 'broker'], notify: ['responsible'] },
  // DF-18: черновик/отправка ответа брокера. Клиенту не показывается
  // (D38: клиент видит только цену варианта, проценты — внутренние);
  // брокеру собственная лента лида и так не видна — аудитория staff.
  broker_estimate_sent: { label: 'Ответ брокера отправлен', audience: ['staff'], notify: ['responsible'] },
  // Правки после отправки — с разницей строк в description (карточка DF-18);
  // ответственный получает уведомление, как и при первой отправке.
  estimate_updated: { label: 'Ответ брокера обновлён после отправки', audience: ['staff'], notify: ['responsible'] },
  // DF-19: расчёт таможенных платежей (новая версия пересчётом или правка
  // черновика). Только сотрудники (D38: расчёт — внутренняя кухня;
  // показ клиенту — отдельное решение P2-02); писем нет — факт виден в
  // ленте, дергать ответственного на каждый пересчёт — спам (§8).
  customs_calc_saved: { label: 'Сохранён расчёт таможенных платежей', audience: ['staff'], notify: [] },
  // DF-16: разрешительные документы (D35). Строки видят все стороны
  // сделки; клиенту уходит письмо о добавленной строке (расчёт — сразу,
  // §8); получив документ — ответственному; «не требуется» — без писем
  // (факт в ленте). permit_overdue — красный по умолчанию
  // (notifications.red_event_types), адресатов решает ДИНАМИЧЕСКОЕ
  // правило в rules.ts по providedBy строки (кто должен предоставить) —
  // реестр статично providedBy не знает (комментарий как у stage).
  permit_added: { label: 'Добавлен разрешительный документ', audience: ['staff', 'client', 'broker'], notify: ['client'] },
  permit_received: { label: 'Разрешительный документ получен', audience: ['staff', 'client', 'broker'], notify: ['responsible-if-external-actor'] },
  permit_waived: { label: 'Разрешительный отмечен не требуемым', audience: ['staff', 'client', 'broker'], notify: [] },
  permit_overdue: { label: 'Просрочен разрешительный документ', audience: ['staff', 'client', 'broker'], notify: [] },
  // DF-26 волна 2 (§6.2, О3): загрузка ≠ принятие. permit_submitted —
  // бывший эффект permit_received при загрузке (pending → submitted);
  // принятие/отклонение — решение сотрудника (accept/reject), отклонение
  // возвращает контроль (с новой версией или другим файлом).
  permit_submitted: { label: 'Документ загружен по разрешительному требованию', audience: ['staff', 'client', 'broker'], notify: ['responsible-if-external-actor'] },
  permit_rejected: { label: 'Документ отклонён, требование вернулось в ожидание', audience: ['staff', 'client', 'broker'], notify: ['client'] },
  permit_reopened: { label: 'Принятое требование возвращено на проверку', audience: ['staff', 'client', 'broker'], notify: ['responsible-if-external-actor'] },
  // DF-26 волна 2: проверки ТН ВЭД (§5.1–5.3, §5.7) — служебные события
  // контура staff (клиент/брокер видят строки проверок в реестре, но
  // смена статуса проверки — внутренняя кухня до требования).
  permit_check_needed: { label: 'Требуется проверка разрешительных (ТН ВЭД)', audience: ['staff'], notify: ['responsible'] },
  permit_check_not_required: { label: 'Проверка: разрешительный не требуется', audience: ['staff', 'client', 'broker'], notify: [] },
  permit_check_review_needed: { label: 'Требуется пересмотр проверки (изменён код ТН ВЭД)', audience: ['staff'], notify: ['responsible'] },
  // Пересмотр завершён: без писем; in-app видимость брокеру — автору
  // исходной проверки обеспечивает список проверок (reviewStatus,
  // GET checks admin/broker) — отдельного in-app канала у брокера нет
  // (DF-03 — очередь писем), «без писем» соблюдено.
  permit_check_reviewed: { label: 'Проверка по ТН ВЭД пересмотрена', audience: ['staff'], notify: [] },
  // Дифф-сохранение оценки (§5.7 п. 0а): привязанная строка удалена —
  // требование «требует ручной привязки» (pending_manual) и обратно.
  permit_relink_needed: { label: 'Связь требования с позицией требует ручного подтверждения', audience: ['staff'], notify: ['responsible'] },
  permit_relinked: { label: 'Требование привязано к позиции вручную', audience: ['staff'], notify: [] },
  // документы (Е): аудитория по умолчанию — внешний документ; для
  // ВНУТРЕННЕГО точка вызова (documents.ts) переопределяет на
  // documentEventAudience(true) = ['staff'] — внешний кабинет не должен
  // даже узнать о факте существования внутреннего документа.
  document_created: { label: 'Документ загружен', audience: ['staff', 'client', 'broker'], notify: ['responsible-if-external-actor'] },
  document_version_added: { label: 'Добавлена версия документа', audience: ['staff', 'client', 'broker'], notify: ['client-broker-if-visible'] },
  document_deleted: { label: 'Документ удалён', audience: ['staff', 'client', 'broker'], notify: [] },
  // DF-12: переходы жизненного цикла. Писем нет — переход виден всем
  // адресатам в ленте сделки, дёргать внешних на каждый «Финальный» —
  // спам (§8); уведомление о новой версии уже уходит клиенту/брокеру.
  document_finalized: { label: 'Документ финализирован', audience: ['staff', 'client', 'broker'], notify: [] },
  document_reopened: { label: 'Документ возвращён в работу', audience: ['staff', 'client', 'broker'], notify: [] },
  // DF-26: «отправить на проверку» — как у document_created: внешний
  // автор двигает документ, ответственному видно (письмо решает правило;
  // лента — всем адресатам документа).
  document_submitted: { label: 'Документ отправлен на проверку', audience: ['staff', 'client', 'broker'], notify: ['responsible-if-external-actor'] },
  // DF-26 (§6.2, O5): семантика скачивания — без уведомлений и
  // дедупликации; формулировки различают «выдана ссылка» (302,
  // передача не подтверждена) и «скачан» (сервер отдал байты).
  // Аудиторию переопределяет точка вызова по isInternal документа
  // (документ-загрузка), как у прочих документных событий.
  document_link_issued: { label: 'Выдана ссылка на скачивание', audience: ['staff', 'client', 'broker'], notify: [] },
  document_downloaded: { label: 'Документ скачан', audience: ['staff', 'client', 'broker'], notify: [] },
  document_package_downloaded: { label: 'Сформирован и отдан архив (ZIP)', audience: ['staff', 'client', 'broker'], notify: [] },
  // DF-26 (AUD-11): смена привязки документа к этапу — сотрудник; всем
  // адресатам документа (факт виден в ленте), без писем.
  document_stage_changed: { label: 'Изменён этап документа', audience: ['staff', 'client', 'broker'], notify: [] },
  // внутренние заметки (Ж3) — только staff, уведомлений нет (§8)
  note_added: { label: 'Внутренняя заметка', audience: ['staff'], notify: [] },
  // настройки системы (DF-00D, D32) — глобальное событие БЕЗ цели-сделки
  // (target не передаётся); только staff, уведомлений нет: факт изменения
  // виден в ленте сотрудникам, письма по настройкам не предусмотрены (§8).
  // description несёт ключ, старое и новое значение — секретов в реестре
  // нет по построению (секреты и адреса инфраструктуры живут в env).
  setting_changed: { label: 'Настройка изменена', audience: ['staff'], notify: [] },

  // безопасность входа (DF-09) — глобальное событие БЕЗ цели-сделки:
  // включение/выключение TOTP в профиле сотрудника. Актёр — сам
  // сотрудник; только staff, уведомлений нет (§8: письма о настройках
  // безопасности не предусмотрены). Секреты в описание не попадают.
  totp_enabled: { label: 'Включена двухфакторная аутентификация', audience: ['staff'], notify: [] },
  totp_disabled: { label: 'Выключена двухфакторная аутентификация', audience: ['staff'], notify: [] },

  // Поток A волна 2 (DF-25, BL-8/BL-9 — план ред. 3 §5.2/§5.3):
  // операции доступа без сделки-цели (у Customer нет ответственного
  // для правила уведомлений). Письма не предусмотрены (§8: как
  // totp_*), факт виден staff в ленте; «уведомление ответственным»
  // плана недостижимо механически (событие не belongs сделке) —
  // компенсация: описание события несёт полный снимок (кто, старый →
  // новый номер, режим доставки / из какой компании в какую).
  customer_user_phone_changed: { label: 'Телефон пользователя компании изменён', audience: ['staff'], notify: [] },
  customer_user_rebound: { label: 'Пользователь перепривязан к другой компании', audience: ['staff'], notify: [] },
}
