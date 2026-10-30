import { Prisma } from '@prisma/client'
import { AUDIENCES, type Audience } from '@/lib/audience'
// Реестр типов событий вынесен в event-registry.ts (v0.6.5): правила
// DF-03 читают его как value, не создавая цикл events ↔ rules.
// Реэкспорт сохраняет прежние точки импорта (тесты, роуты).
import type { ActivityActor, ActivityTarget, ActivityType } from '@/lib/activity'
import { EVENT_TYPES } from '@/lib/event-registry'
import { recomputeAfterEvent } from '@/lib/waiting-db'

export { EVENT_TYPES }

// ─── DF-01 «События как ось»: emitEvent + очередь уведомлений DF-03 ──
// Ось системы (D29): события сделки пишутся ТОЛЬКО здесь. Ленты
// кабинетов, Пульс (DF-07), уведомления (DF-03) и сводка (DF-08)
// строятся поверх одного журнала Activity — читают через
// eventWhereFor() из lib/audience.ts, ничего не пересчитывают.
//
// С v0.6.5 emitEvent — ещё и единая точка постановки уведомлений в
// очередь (карточка DF-03, шаг 6): после записи события правила
// матрицы §8 (lib/notifications/rules.ts) создают строки очереди
// Notification В ТОЙ ЖЕ транзакции — сбой постановки откатывает
// событие вместе с данными (инвариант §1 п. 2: «письмо не должно
// потеряться молча»; сбой ОТПРАВКИ, в отличие от постановки, на
// пользователя не влияет — повторяет диспетчер).
//
// Файл тянет db-контекст транзакции — импорт из клиентских компонентов
// запрещён (как и activity.ts).
// Импорт enqueue/dispatch — ДИНАМИЧЕСКИЙ: enqueue → rules → settings,
// а settings.ts эмитит setting_changed. Статические рёбра events →
// enqueue и settings → events замкнули бы цикл; динамический импорт
// рвёт его (модули загружаются после инициализации реестров).

export const SYSTEM_ACTOR_NAME = 'Система'

// Подсказка правилам уведомлений для событий, где из самой записи
// получателя не вывести: подключение брокера — письмо идёт ИМЕННО
// подключаемому брокеру, а не всем уже подключённым (§8).
export type NotifyHint = { brokerId?: string }

export type EmitEventInput = {
  // Цель-сделка: ровно одна из трёх (см. ActivityTarget). НЕ задана —
  // глобальное событие без сделки (DF-00D: setting_changed — настройка
  // не belongs ни одной заявке); колонки orderId/leadId/contractorId
  // в БД nullable, событие с пустой целью легитимно (Ж5-логика лент
  // читает по цели, staff-лента видит и глобальные).
  target?: ActivityTarget | null
  actor: ActivityActor
  type: ActivityType
  description: string
  // Не задана → аудитория по умолчанию из реестра EVENT_TYPES.
  // Явная — для исключений поверх реестра (внутренний документ и т.п.).
  audience?: Audience[]
  // Связь с этапом/документом без FK — схема df_01_event_audience.
  stageId?: string | null
  documentId?: string | null
  // DF-03: уточнение правил уведомлений (подключаемый брокер).
  notify?: NotifyHint
}

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

// Запись события сделки + постановка уведомлений в очередь.
// Семантика ошибок РАЗДЕЛЬНАЯ (v0.6.5):
//  • запись Activity — «лента наблюдение»: ошибка глотается и
//    логируется, операция пользователя не валится (как в DF-01);
//  • постановка Notification — бизнес-инвариант DF-03: сбой БРОСАЕТ,
//    транзакция откатывает и данные, и событие, и письма (создание
//    сделки без письма = молчаливая потеря — запрещено карточкой).
// isInternal снят contract-миграцией df_03_contract: единственная
// точка видимости — audience (eventWhereFor, lib/audience.ts).
// Возвращает id события (null — запись не удалась, очередь пустая).
export async function emitEvent(
  tx: Prisma.TransactionClient,
  input: EmitEventInput,
): Promise<string | null> {
  const meta = EVENT_TYPES[input.type]
  const audience = normalizeAudience(input.audience ?? meta.audience)
  if (audience.length === 0) {
    // Пустая аудитория = событие без зрителей (рудимент); CHECK
    // activity_audience_nonempty в БД не даст и тихой записи.
    console.error('[emitEvent] пустая аудитория, событие не записано:', input.type)
    return null
  }
  let created: { id: string }
  try {
    created = await tx.activity.create({
      data: {
        ...(input.target ?? {}),
        actorType: input.actor.type,
        actorId: input.actor.type === 'system' ? null : input.actor.id,
        actorName: input.actor.type === 'system' ? SYSTEM_ACTOR_NAME : input.actor.name,
        type: input.type,
        description: input.description,
        audience,
        ...(input.stageId ? { stageId: input.stageId } : {}),
        ...(input.documentId ? { documentId: input.documentId } : {}),
      },
      select: { id: true },
    })
  } catch (e) {
    console.error('[emitEvent] не записано:', input.type, input.description, e)
    return null
  }
  // ── DF-05 «У кого мяч»: пересчёт ожидания в той же транзакции ──────
  // Событие с целью-сделкой (заявка/запрос) может менять состояние —
  // после записи события пересчитывается waitingOn* той же сделки
  // (событие лида пересчитывает и его заявку — оценки живут на связи
  // лида, см. recomputeAfterEvent). Ошибка пересчёта НЕ глотается
  // (как постановка писем): устаревший «мяч» — недопустимое состояние
  // для «Требует внимания», Пульса (DF-07) и сводки (DF-08); откат
  // всей операции, повтор безопасен. Глобальные события
  // (setting_changed) и события подрядчика (D31) пересчёта не касаются.
  if (input.target && ('orderId' in input.target || 'leadId' in input.target)) {
    await recomputeAfterEvent(tx, input.target)
  }
  // ── DF-03: очередь уведомлений (та же транзакция) ──────────────────
  // Динамический импорт — разрыв цикла events ↔ rules ↔ settings
  // (см. шапку). Ошибка постановки НЕ глотается: откат всей операции.
  const { enqueueNotifications } = await import('./notifications/enqueue')
  await enqueueNotifications(tx, {
    eventId: created.id,
    type: input.type,
    actor: input.actor,
    target: input.target ?? null,
    stageId: input.stageId ?? null,
    documentId: input.documentId ?? null,
    notifyHint: input.notify ?? null,
    description: input.description,
  })
  // Немедленная попытка диспетчера для immediate/red (≤ 5 минут, D33):
  // after() выполняет колбэк после завершения ответа = после COMMIT.
  // Вне request-контекста (скрипты/тесты) after() бросает — это окно
  // пропускаем: внешний cron (workflow, ≥ 5 мин) догонит по расписанию.
  try {
    const { scheduleDispatch } = await import('./notifications/dispatch')
    scheduleDispatch()
  } catch {
    // нет request-контекста — dispatch по расписанию
  }
  return created.id
}
