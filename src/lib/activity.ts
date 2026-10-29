import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
// DF-01: запись события — emitEvent (единственная точка записи);
// SYSTEM_ACTOR_NAME живёт в events.ts (разрыв value-цикла:
// activity → events — value, events → activity — только типы).
import { emitEvent, SYSTEM_ACTOR_NAME } from '@/lib/events'
import type { Audience } from '@/lib/audience'

// ─── Журнал событий (Дорожка Ж, Ж2) ─────────────────────────────────
// Единственная точка записи в Activity: write-роуты зовут emitEvent()
// из lib/events.ts (с DF-01), прямой db.activity.create в роутах
// запрещён — инвариант «ровно одна цель» и формат актёра держатся
// там, а не в пятнадцати местах. Здесь живут типы (актёр, цель, коды),
// logInternalNote и проекция чтения ленты. Обёртка logActivity и
// фрагмент ACTIVITY_EXTERNAL_WHERE удалены contract-миграцией
// df_03_contract (DEPRECATIONS 0.6.5): замороженный роут подрядчика
// переведён на emitEvent, видимость считает eventWhereFor.
// Файл тянет db — импорт из клиентских компонентов запрещён (проекция
// для UI — ACTIVITY_PUBLIC_FIELDS ниже, используется в GET-роутах).

// Стабильные коды событий: расширение списка — правка здесь, значения
// в БД уже записаны и переписываться не должны (лента показывает
// description, код — для будущих фильтров/уведомлений, Ж5+).
export const ACTIVITY_TYPES = [
  // воронка лидов
  'lead_created',
  'lead_status_changed',
  // P1-01: смена ответственного менеджера лида (назначение/переназначение/снятие)
  'lead_assignee_changed',
  // P1-02: правка анкеты лида (контакты/груз) — diff «Поле: старое → новое»;
  // актёр — сотрудник (админка) или клиент (кабинет, до первого варианта)
  'lead_edited',
  'lead_converted',
  'option_added',
  'option_updated',
  'option_selected',
  'option_removed',
  // заявки
  'order_created',
  'order_status_changed',
  // P1-01: смена ответственного менеджера заявки
  'order_assignee_changed',
  'order_cargo_changed',
  'order_quote_changed',
  'order_fields_changed',
  // этапы
  'stage_added',
  'stage_status_changed',
  'stage_contractor_changed',
  'stage_planned_changed',
  'stage_updated',
  'stage_removed',
  // подрядчики
  'contractor_created',
  'contractor_updated',
  'contractor_pool_changed',
  'contractor_password_changed',
  // брокеры (Д): подключение/отключение к сделке — цель событие всегда
  // лид ИЛИ заявка (не сам брокер: у управления справочником цели нет,
  // решение Ж6в об аудите доступов действует и здесь); оценка
  // таможенных платежей — событие лида с актёром-брокером.
  'lead_broker_attached',
  'lead_broker_detached',
  'order_broker_attached',
  'order_broker_detached',
  'broker_estimate_changed',
  // DF-18: ответ брокера как документ со статусом — отправка
  // (draft → sent, уведомление ответственному) и правки ПОСЛЕ отправки
  // (с разницей строк в description). Клиенту не видны (audience staff):
  // проценты брокера — внутренняя кухня сделки, клиент видит только
  // итоговую цену варианта (D38).
  'broker_estimate_sent',
  'estimate_updated',
  // DF-19: расчёт таможенных платежей в рублях (D38/D39) — сохранение
  // новой версии (пересчёт) или правка черновика. Только сотрудники:
  // проценты брокера и платежи — внутренняя кухня (D38), показ клиенту
  // — отдельное решение P2-02.
  'customs_calc_saved',
  // документы (Е): создание/версии/удаление — цель событие лид ИЛИ
  // заявка (сделка, на которой живёт документ); события о ВНУТРЕННИХ
  // документах пишутся staff-only (audience staff) — внешний кабинет
  // не должен даже узнать о факте их существования.
  'document_created',
  'document_version_added',
  'document_deleted',
  // внутренние заметки (Ж3): по заявке и лиду; текст заметки —
  // description, автор — actor, время — createdAt. Попадают в
  // ленту, внешним кабинетам не показываются (audience — staff-only).
  'note_added',
  // настройки системы (DF-00D, D32): изменение значения из реестра
  // SETTINGS. Цель событие — нет (настройка глобальна, не belongs
  // сделке); старое/новое — description (без секретов: ключи
  // реестра не содержат их по определению — секреты живут в env).
  // Аудитория staff: значения настроек — внутренняя кухня.
  'setting_changed',
] as const
export type ActivityType = (typeof ACTIVITY_TYPES)[number]

// Кто действовал. Сотрудник, подрядчик, клиент (И1 — запрос из
// кабинета) и брокер (Д — оценка таможенных платежей из портала) —
// id+имя. Система — событие без человека (сегодня таких в очереди
// нет, слот оставлен: Ж3-заметки и будущие автоматизации).
// DF-02A (Блок 4): для клиента и брокера id = id ПОЛЬЗОВАТЕЛЯ
// (CustomerUser/BrokerUser), name — снимок КОМПАНИИ (наименее
// привилегированная строка: актёр-человек собирается при чтении
// lib/actor-name.ts по actorId — «Имя (Компания)»/компания/имя
// по роли читателя). У сотрудника/подрядчика — прежние снимки.
export type ActivityActor =
  | { type: 'employee'; id: string; name: string }
  | { type: 'contractor'; id: string; name: string }
  | { type: 'client'; id: string; name: string }
  | { type: 'broker'; id: string; name: string }
  | { type: 'system' }

// Конкретные типы актёров (Е: документы требуют ровно один из трёх
// — сотрудник/клиент/брокер, система файлы не грузит; суженный
// возврат хелперов делает их взаимозаменяемыми с DocActor без
// спредов и каста на каждом вызове).
export type EmployeeActor = { type: 'employee'; id: string; name: string }
export type ClientActor = { type: 'client'; id: string; name: string }
export type BrokerActor = { type: 'broker'; id: string; name: string }

export function employeeActor(e: { id: string; name: string }): EmployeeActor {
  return { type: 'employee', id: e.id, name: e.name }
}

// У подрядчика «имя» — companyName (люди не заведены, Г4).
export function contractorActor(c: { id: string; companyName: string }): ActivityActor {
  return { type: 'contractor', id: c.id, name: c.companyName }
}

// Клиент кабинета (И1). DF-02A (Блок 4): актор — ЧЕЛОВЕК (userId),
// name — снимок КОМПАНИИ (CurrentClient.name = имя компании).
// Проекция отображаемого имени — lib/actor-name.ts при чтении.
export function clientActor(c: { userId: string; name: string }): ClientActor {
  return { type: 'client', id: c.userId, name: c.name }
}

// Брокер портала (Д). DF-02A (Блок 4): актор — ЧЕЛОВЕК (userId),
// name — снимок компании (companyName); проекция — lib/actor-name.ts.
export function brokerActor(b: { userId: string; companyName: string }): BrokerActor {
  return { type: 'broker', id: b.userId, name: b.companyName }
}

export const SYSTEM_ACTOR: ActivityActor = { type: 'system' }

// Цель-сделка — ровно одна из трёх. Дискриминированное объединение:
// TS не даст передать две цели. Ноль целей на уровне emitEvent
// легитимен (EmitEventInput.target опционален, DF-00D): глобальные
// события без сделки (setting_changed) пишутся без цели, колонки БД
// nullable; этот union описывает только цель-сделку.
export type ActivityTarget =
  | { orderId: string }
  | { leadId: string }
  | { contractorId: string }

// ── Внутренние заметки (Ж3) ────────────────────────────────────────
// NOTE_MAX_LENGTH живёт в lib/note-constants.ts (клиент-безопасный
// файл): потолок нужен и роутам (zod), и NoteForm (maxLength), а этот
// модуль тянет Prisma и из клиентских компонентов не импортируется.

// Запись заметки. В отличие от logActivity (наблюдение над действием —
// ошибка записи глотается), заметка — САМО действие пользователя:
// молчаливая потеря введённого текста недопустима, ошибка записи
// пробураливается наверх (роут вернёт 500, а не «успех без заметки»).
// Возвращает созданную строку в публичной проекции — роут отдаёт её
// клиенту, UI подставляет в ленту.
export type NoteRow = {
  id: string
  actorType: 'employee' | 'contractor' | 'client' | 'broker' | 'system'
  actorName: string
  type: string
  description: string
  // Форма ответа UI; заметка всегда staff-only — флаг константный
  // (колонка Activity.isInternal удалена contract-миграцией df_03_contract,
  // единственная точка видимости — audience, lib/audience.ts).
  isInternal: true
  createdAt: Date
}

export async function logInternalNote(
  target: ActivityTarget,
  actor: ActivityActor,
  text: string,
  tx?: Prisma.TransactionClient,
): Promise<NoteRow> {
  const client = tx ?? db
  const created = await client.activity.create({
    data: {
      ...target,
      actorType: actor.type,
      actorId: actor.type === 'system' ? null : actor.id,
      actorName: actor.type === 'system' ? SYSTEM_ACTOR_NAME : actor.name,
      type: 'note_added',
      description: text,
      // DF-01: заметка — staff-only (CHECK activity_audience_nonempty
      // требует непустую audience; note_added в реестре — ['staff']).
      audience: ['staff'],
    },
    select: ACTIVITY_PUBLIC_FIELDS,
  })
  // isInternal — константная форма ответа (заметка всегда staff-only),
  // остальное — прямая проекция созданной строки.
  return { ...created, isInternal: true } as NoteRow
}

// ── Чтение ленты (GET карточек) ─────────────────────────────────────
// Публичная проекция. DF-02A (Блок 4): actorId включён — проекция
// «Имя (Компания)» собирается при чтении (lib/actor-name.ts) по id
// пользователя; id непрозрачен (cuid), имя-снимок остаётся строкой.
// audience включён вместо удалённого isInternal: UI выводит бейдж
// «Заметка» (isActivityRow ниже) и другие приватные пометки из
// audience — единственного носителя видимости после contract-релиза.
export const ACTIVITY_PUBLIC_FIELDS = {
  id: true,
  actorType: true,
  actorId: true,
  actorName: true,
  type: true,
  description: true,
  audience: true,
  createdAt: true,
} as const

// Заметка (и другое staff-only событие) — для UI-пометок. Функция в
// клиентском безопасном стиле: работает по проекции ACTIVITY_PUBLIC_FIELDS.
export function isStaffOnlyRow(row: { audience: readonly string[] }): boolean {
  return row.audience.length === 1 && row.audience[0] === 'staff'
}

// Лимит выдачи: лента без пагинации (Ж4 сделает постраничность для
// списков, лента карточки — окно последних событий, 100 строк с
// запасом покрывает жизнь заявки MVP-масштаба).
export const ACTIVITY_FEED_TAKE = 100

// Дата для описаний событий: дд.мм.гггг по UTC. Плановые даты этапов
// приходят UTC-полуночью (UI шлёт T00:00:00.000Z) — локальная таймзона
// сервера не должна сдвигать день в описании.
export function fmtRuDate(d: Date | null | undefined): string {
  if (!d) return '—'
  const dd = String(d.getUTCDate()).padStart(2, '0')
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  return `${dd}.${mm}.${d.getUTCFullYear()}`
}
