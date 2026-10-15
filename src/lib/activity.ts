import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'

// ─── Журнал событий (Дорожка Ж, Ж2) ─────────────────────────────────
// Единственная точка записи в Activity: write-роуты зовут logActivity(),
// прямой db.activity.create в роутах запрещён — инвариант «ровно одна
// цель» и формат актёра держатся здесь, а не в пятнадцати местах.
// Файл тянет db — импорт из клиентских компонентов запрещён (проекция
// для UI — ACTIVITY_PUBLIC_FIELDS ниже, используется в GET-роутах).

// Стабильные коды событий: расширение списка — правка здесь, значения
// в БД уже записаны и переписываться не должны (лента показывает
// description, код — для будущих фильтров/уведомлений, Ж5+).
export const ACTIVITY_TYPES = [
  // воронка лидов
  'lead_created',
  'lead_status_changed',
  'lead_converted',
  'option_added',
  'option_updated',
  'option_selected',
  'option_removed',
  // заявки
  'order_created',
  'order_status_changed',
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
  // документы (Е): создание/версии/удаление — цель событие лид ИЛИ
  // заявка (сделка, на которой живёт документ); события о ВНУТРЕННИХ
  // документах пишутся с isInternal — внешний кабинет не должен
  // даже узнать о факте их существования.
  'document_created',
  'document_version_added',
  'document_deleted',
  // внутренние заметки (Ж3): по заявке и лиду; текст заметки —
  // description, автор — actor, время — createdAt. Попадают в
  // ленту, внешним кабинетам не показываются (isInternal).
  'note_added',
] as const
export type ActivityType = (typeof ACTIVITY_TYPES)[number]

// Кто действовал. Сотрудник, подрядчик, клиент (И1 — запрос из
// кабинета) и брокер (Д — оценка таможенных платежей из портала) —
// id+имя (имя пишется снимком, id — для будущих фильтров «действия
// сотрудника» без FK). Система — событие без человека (сегодня таких
// в очереди нет, слот оставлен: Ж3-заметки и будущие автоматизации).
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

// Клиент кабинета (И1): имя — Customer.name на момент действия
// (снимок, как у остальных актёров).
export function clientActor(c: { id: string; name: string }): ClientActor {
  return { type: 'client', id: c.id, name: c.name }
}

// Брокер портала (Д): имя — companyName на момент действия (снимок,
// как у подрядчика — люди у брокера не заведены).
export function brokerActor(b: { id: string; companyName: string }): BrokerActor {
  return { type: 'broker', id: b.id, name: b.companyName }
}

export const SYSTEM_ACTOR: ActivityActor = { type: 'system' }
export const SYSTEM_ACTOR_NAME = 'Система'

// Цель события — ровно одна из трёх. Дискриминированное объединение:
// TS не даст передать две цели или ни одной.
export type ActivityTarget =
  | { orderId: string }
  | { leadId: string }
  | { contractorId: string }

// ── Запись события ──────────────────────────────────────────────────
// tx — необязательный клиент транзакции: внутри $transaction (В3,
// Г2-рождение) событие пишется в той же транзакции, что и изменение —
// откат изменения откатывает и запись, «событие без причины» не
// рождается. Отдельные операции (PATCH заявки) пишут после успеха.
// Ошибка записи журнала НЕ валит основную операцию: если изменение
// уже зафиксировано в БД, падать на ленте нельзя — глотаем и логируем
// в консоль (лента — наблюдение, не бизнес-данные; пустая строка
// лучше сломанного сохранения заявки).
export async function logActivity(
  target: ActivityTarget,
  actor: ActivityActor,
  type: ActivityType,
  description: string,
  tx?: Prisma.TransactionClient,
  opts?: { isInternal?: boolean },
): Promise<void> {
  const client = tx ?? db
  try {
    await client.activity.create({
      data: {
        ...target,
        actorType: actor.type,
        actorId: actor.type === 'system' ? null : actor.id,
        actorName: actor.type === 'system' ? SYSTEM_ACTOR_NAME : actor.name,
        type,
        description,
        // Е: события о внутренних документах — внутренние (симметрия
        // с заметками Ж3); все прочие события — прежние, false.
        ...(opts?.isInternal ? { isInternal: true } : {}),
      },
    })
  } catch (e) {
    console.error('[logActivity] не записано:', type, description, e)
  }
}

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
  isInternal: boolean
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
      isInternal: true,
    },
    select: ACTIVITY_PUBLIC_FIELDS,
  })
  return created as NoteRow
}

// ── Чтение ленты (GET карточек) ─────────────────────────────────────
// Публичная проекция без actorId — ленте достаточно имени-снимка.
// isInternal нужен UI: заметки рисуются иначе (бейдж «Заметка»).
export const ACTIVITY_PUBLIC_FIELDS = {
  id: true,
  actorType: true,
  actorName: true,
  type: true,
  description: true,
  isInternal: true,
  createdAt: true,
} as const

// Обязательный фрагмент where для ВНЕШНИХ read-контекстов ленты —
// кабинета подрядчика (Г4) и будущего клиентского кабинета (И1):
// внутренние заметки (и любые isInternal-события) наружу не отдаются.
// Сегодня ленты наружу не выходят вообще (карточка подрядчика —
// select без activities); любой будущий внешний роут ленты обязан
// включить этот фрагмент в where — заметка по определению не для
// чужих глаз, «догадаться потом» здесь дороже, чем заложить сразу.
export const ACTIVITY_EXTERNAL_WHERE = { isInternal: false } as const

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
