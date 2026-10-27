import { Prisma } from '@prisma/client'
import { AUDIENCES, type Audience } from '@/lib/audience'
// Только ТИПЫ — value-импорт создал бы цикл activity ↔ events
// (activity.ts вызывает emitEvent). `import type` стирается компилятором.
import type { ActivityActor, ActivityTarget, ActivityType } from '@/lib/activity'

// ─── DF-01 «События как ось»: emitEvent + реестр EVENT_TYPES ────────
// Ось системы (D29): события сделки пишутся ТОЛЬКО здесь. Ленты
// кабинетов, Пульс (DF-07), уведомления (DF-03) и сводка (DF-08)
// строятся поверх одного журнала Activity — читают через
// eventWhereFor() из lib/audience.ts, ничего не пересчитывают.
//
// Файл тянет db-контекст транзакции — импорт из клиентских компонентов
// запрещён (как и activity.ts).

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

// Метаданные типа события: подпись (для будущих фильтров/писем),
// аудитория по умолчанию и правила уведомления. Реестр живёт РЯДОМ с
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
  // responsible + client-neutral) — решает диспетчер DF-03 по данным,
  // реестр статично статусы не знает.
  stage_status_changed: { label: 'Статус этапа изменён', audience: ['staff', 'client'], notify: [] },
  // Имя подрядчика в description — клиенту/брокеру не отдаём
  // (глоссарий RULES 2.6: Contractor — не показываем).
  stage_contractor_changed: { label: 'Исполнитель этапа изменён', audience: ['staff'], notify: [] },
  stage_planned_changed: { label: 'План этапа изменён', audience: ['staff', 'client'], notify: [] },
  stage_updated: { label: 'Этап обновлён', audience: ['staff', 'client'], notify: [] },
  stage_removed: { label: 'Этап удалён', audience: ['staff', 'client'], notify: [] },
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
  // документы (Е): аудитория по умолчанию — внешний документ; для
  // ВНУТРЕННЕГО точка вызова (documents.ts) переопределяет на
  // documentEventAudience(true) = ['staff'] — внешний кабинет не должен
  // даже узнать о факте существования внутреннего документа.
  document_created: { label: 'Документ загружен', audience: ['staff', 'client', 'broker'], notify: ['responsible-if-external-actor'] },
  document_version_added: { label: 'Добавлена версия документа', audience: ['staff', 'client', 'broker'], notify: ['client-broker-if-visible'] },
  document_deleted: { label: 'Документ удалён', audience: ['staff', 'client', 'broker'], notify: [] },
  // внутренние заметки (Ж3) — только staff, уведомлений нет (§8)
  note_added: { label: 'Внутренняя заметка', audience: ['staff'], notify: [] },
}

// Снимок имени системного актёра. Живёт здесь (а не в activity.ts),
// чтобы emitEvent не тянул value-цикл: activity → events (value),
// events → activity (только типы). Имя — снимок, локализация не
// планируется (Ж3).
export const SYSTEM_ACTOR_NAME = 'Система'

// Аудитория события: явная > реестр. Канонизация — только элементы
// AUDIENCES в их порядке (детерминированная запись, дедупликация).
// 'contractor' и прочее — не аудитория (D31): чужие значения режутся,
// а факт сигнализируется в консоль — это ошибка вызывающего кода
// (тип Audience отсекает её на компиляции; сигнал — для данных,
// пришедших из БД/JSON в обход типов).
function normalizeAudience(list: readonly Audience[]): Audience[] {
  const extra = list.filter((a) => !AUDIENCES.includes(a))
  if (extra.length > 0) {
    console.error('[emitEvent] в аудитории посторонние значения (вырезаны):', extra)
  }
  return AUDIENCES.filter((a) => list.includes(a))
}

export type EmitEventInput = {
  target: ActivityTarget
  actor: ActivityActor
  type: ActivityType
  description: string
  // Не задана → аудитория по умолчанию из реестра EVENT_TYPES.
  // Явная — для исключений поверх реестра (внутренний документ и т.п.).
  audience?: Audience[]
  // Связь с этапом/документом без FK — схема df_01_event_audience.
  stageId?: string | null
  documentId?: string | null
}

// Запись события сделки. Семантика ошибок — как у прежнего logActivity:
// лента — наблюдение, не бизнес-данные, падать на ней нельзя; ошибка
// записи глотается и логируется. При вызове ВНУТРИ $transaction (tx —
// DoD 2.2 п.9) откат данных откатывает и событие; вне транзакции
// передаётся db. isInternal пишется согласованно:
// isInternal = (audience == {staff}) — двойная правда исключена;
// колонка удаляется contract-релизом после DF-03.
export async function emitEvent(
  tx: Prisma.TransactionClient,
  input: EmitEventInput,
): Promise<void> {
  const meta = EVENT_TYPES[input.type]
  const audience = normalizeAudience(input.audience ?? meta.audience)
  if (audience.length === 0) {
    // Пустая аудитория = событие без зрителей (рудимент); CHECK
    // activity_audience_nonempty в БД не даст и тихой записи.
    console.error('[emitEvent] пустая аудитория, событие не записано:', input.type)
    return
  }
  const isInternal = audience.length === 1 && audience[0] === 'staff'
  try {
    await tx.activity.create({
      data: {
        ...input.target,
        actorType: input.actor.type,
        actorId: input.actor.type === 'system' ? null : input.actor.id,
        actorName: input.actor.type === 'system' ? SYSTEM_ACTOR_NAME : input.actor.name,
        type: input.type,
        description: input.description,
        isInternal,
        audience,
        ...(input.stageId ? { stageId: input.stageId } : {}),
        ...(input.documentId ? { documentId: input.documentId } : {}),
      },
    })
  } catch (e) {
    console.error('[emitEvent] не записано:', input.type, input.description, e)
  }
}
