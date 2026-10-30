import type { Prisma } from '@prisma/client'
import { EVENT_TYPES } from '@/lib/event-registry'
import type { ActivityActor, ActivityTarget, ActivityType } from '@/lib/activity'
import { participantsOf, recipientsOfCustomer, recipientsOfBroker } from '@/lib/participants'
import { getSetting } from '@/lib/settings'

// ─── DF-03: правила матрицы §8 «событие → получатели → режим» ────────
// Карточка DF-03: rules.ts — «матрица §8 ROADMAP-DEALFLOW: событие →
// получатели → режим». Источник правил — реестр EVENT_TYPES
// (lib/event-registry.ts: поле notify), динамика — по ДАННЫМ сделки:
//  • фаза заявки (настройка notifications.immediate_phases) решает,
//    внешнему получателю письмо уходит сразу или копится в окна (D33);
//  • целевой статус этапа (stage_status_changed): done → клиенту,
//    problem → ответственному + клиенту нейтрально, оба «красные»;
//    реестр статично статусы не знает (комментарий реестра DF-01);
//  • «красные» типы из настройки notifications.red_event_types —
//    вне окон и лимитов (антишторм — на постановке, enqueue.ts).
//
// Адресаты собираются ИСКЛЮЧИТЕЛЬНО через lib/participants.ts —
// инвариант карточки DF-02: «ни один роут не собирает участников
// вручную в новом коде». Получатель — человек (DF-02A) с email;
// компания — фолбэк (recipientsOfCustomer/recipientsOfBroker).
// Подрядчик письмам не подлежит (D31): цель contractorId → пусто.
//
// Файл серверный (settings → db) — импорт из клиентских компонентов
// запрещён. Динамически импортируется из events.ts (разрыв цикла).

export type NotifyMode = 'immediate' | 'regular' | 'red'
export type RecipientKind = 'employee' | 'client' | 'broker'

// Конверт — строка будущей очереди без текстов: кому (kind+id+адрес),
// каким режимом и нужна ли нейтральная формулировка (аудит №16:
// клиенту «задержка», не «проблема»).
export type NotificationEnvelope = {
  kind: RecipientKind
  // id человека-получателя (Employee/CustomerUser/BrokerUser); null —
  // общий адрес компании (фолбэк получателей, DF-02).
  recipientId: string | null
  to: string
  mode: NotifyMode
  neutral: boolean
}

// Событие в терминах правил (снимок из emitEvent, lib/events.ts).
export type ResolvedDealEvent = {
  type: ActivityType
  actor: ActivityActor
  target: ActivityTarget | null
  stageId: string | null
  documentId: string | null
  notifyHint: { brokerId?: string; permitProvidedBy?: 'client' | 'broker' | 'staff' } | null
}

// Фаза сделки → имя из настройки notifications.immediate_phases
// (DF-00D: дефолт ['запрос','расчёт','подтверждение'] — согласование
// уходит сразу, перевозка копится в окна). Завершённые/отменённые
// заявки считаются перевозкой: финальные письма клиенту — обычные.
const ORDER_PHASE: Record<string, string> = {
  calculating: 'расчёт',
  confirmed: 'подтверждение',
  in_progress: 'перевозка',
  completed: 'перевозка',
  cancelled: 'перевозка',
}
const LEAD_PHASE = 'запрос'

async function dealPhase(
  tx: Prisma.TransactionClient,
  target: ActivityTarget
): Promise<string | null> {
  if ('orderId' in target) {
    const order = await tx.order.findUnique({
      where: { id: target.orderId },
      select: { status: true },
    })
    return order ? (ORDER_PHASE[order.status] ?? 'перевозка') : null
  }
  if ('leadId' in target) return LEAD_PHASE
  return null // цель contractorId — не сделка (D31)
}

export async function resolveRecipients(
  tx: Prisma.TransactionClient,
  event: ResolvedDealEvent
): Promise<NotificationEnvelope[]> {
  const meta = EVENT_TYPES[event.type]
  // Реестр — единственный источник правил (IC-04); ИСКЛЮЧЕНИЕ —
  // stage_status_changed: его правило ДИНАМИЧЕСКОЕ (по целевому статусу
  // этапа, комментарий реестра), в реестре notify=[] — silent-полного
  // guard это не касается. Глобальные события (без сделки) и события
  // подрядчика (D31) уведомлений не порождают всегда.
  if (!meta) return []
  const target = event.target
  if (!target || (!('orderId' in target) && !('leadId' in target))) return []
  const isStageEvent = event.type === 'stage_status_changed'
  // DF-16: правило permit_overdue тоже ДИНАМИЧЕСКОЕ — адресатов решает
  // providedBy строки (кто должен предоставить, notifyHint от скана
  // диспетчера); в реестре notify=[] — silent-полный guard не касается.
  const isPermitOverdue = event.type === 'permit_overdue'
  if (meta.notify.length === 0 && !isStageEvent && !isPermitOverdue) return []

  const ref: { orderId?: string; leadId?: string } =
    'orderId' in target ? { orderId: target.orderId } : { leadId: target.leadId }
  const parts = await participantsOf(tx, ref)

  const [immediatePhases, redTypes, staffMode] = await Promise.all([
    getSetting('notifications.immediate_phases'),
    getSetting('notifications.red_event_types'),
    getSetting('notifications.staff_mode'),
  ])
  const phase = await dealPhase(tx, target)
  const dealImmediate = phase !== null && immediatePhases.includes(phase)
  const extMode: NotifyMode = dealImmediate ? 'immediate' : 'regular'
  // Письма сотрудникам: настройка staff_mode (immediate | digest);
  // «красные» типы перекрывают оба режима — вне окон и лимитов (D33).
  const staffModeN: NotifyMode = staffMode === 'digest' ? 'regular' : 'immediate'
  const isRed = redTypes.includes(event.type)
  const staffModeResolved: NotifyMode = isRed ? 'red' : staffModeN
  const extModeResolved: NotifyMode = isRed ? 'red' : extMode

  const out: NotificationEnvelope[] = []
  const push = (
    kind: RecipientKind,
    recipientId: string | null,
    to: string,
    mode: NotifyMode,
    neutral = false
  ) => {
    if (!to) return
    const key = `${kind}:${recipientId ?? `company:${to}`}`
    if (out.some((e) => `${e.kind}:${e.recipientId ?? `company:${e.to}`}` === key)) return
    out.push({ kind, recipientId, to, mode, neutral })
  }
  const pushStaff = (persons: { id: string; email: string | null }[], mode: NotifyMode) => {
    for (const p of persons) if (p.email) push('employee', p.id, p.email, mode)
  }
  const pushClient = async (mode: NotifyMode, neutral: boolean) => {
    if (!parts.client) return
    const recipients = await recipientsOfCustomer(tx, parts.client.id)
    for (const r of recipients) push('client', r.userId, r.email, mode, neutral)
  }
  const pushBrokers = async (brokerIds: string[] | null, mode: NotifyMode) => {
    const list = brokerIds ? parts.brokers.filter((b) => brokerIds.includes(b.id)) : parts.brokers
    for (const b of list) {
      const recipients = await recipientsOfBroker(tx, b.id)
      for (const r of recipients) push('broker', r.userId, r.email, mode)
    }
  }

  // ── Динамика статуса этапа (реестр: «решают правила по данным») ──
  if (event.type === 'stage_status_changed') {
    if (!event.stageId) return []
    const stage = await tx.orderStageInstance.findUnique({
      where: { id: event.stageId },
      select: { status: true },
    })
    if (!stage) return []
    if (stage.status === 'done') {
      // §8: «Этап: статус done — клиент — обычный» (в согласовании — сразу).
      await pushClient(extModeResolved, false)
      return out
    }
    if (stage.status === 'problem') {
      // §8: красный и ответственному, и клиенту (нейтральный текст).
      pushStaff(parts.staff, 'red')
      await pushClient('red', true)
      return out
    }
    return [] // not_started/in_progress — §8 писем не предусматривает
  }

  // ── DF-16: красная просрочка разрешительного (скан диспетчера) ──
  // Карточка: «красное письмо тому, кто должен предоставить, и
  // ответственному». providedBy приходит в notifyHint (строка читается
  // сканом ДО события — после записиActivity уже не найти без колонки).
  if (isPermitOverdue) {
    const providedBy = event.notifyHint?.permitProvidedBy ?? 'staff'
    if (providedBy === 'client') await pushClient('red', false)
    else if (providedBy === 'broker') await pushBrokers(null, 'red')
    // providedBy='staff' — обязательство внутреннее: письмо только
    // ответственному (строка ниже). Красный режим — у всех адресатов.
    pushStaff(parts.staff, 'red')
    return out
  }

  for (const rule of meta.notify) {
    if (rule === 'responsible') {
      pushStaff(parts.staff, staffModeResolved)
    } else if (rule === 'responsible-if-not-actor') {
      const actorId = event.actor.type === 'system' ? null : event.actor.id
      const staff = actorId ? parts.staff.filter((p) => p.id !== actorId) : parts.staff
      pushStaff(staff, staffModeResolved)
    } else if (rule === 'responsible-if-external-actor') {
      if (event.actor.type === 'client' || event.actor.type === 'broker') {
        pushStaff(parts.staff, staffModeResolved)
      }
    } else if (rule === 'new-assignee') {
      // Новый ответственный — assignee ПОСЛЕ обновления (emit вызывается
      // следом). Сам себе назначение не отправляем; снятие (null) — писем
      // нет: мастера и так видят факт в ленте (§8: строка про смену).
      const assigneeId =
        'orderId' in ref
          ? (
              await tx.order.findUnique({
                where: { id: ref.orderId },
                select: { assignedToId: true },
              })
            )?.assignedToId
          : (
              await tx.lead.findUnique({
                where: { id: ref.leadId },
                select: { assignedToId: true },
              })
            )?.assignedToId
      const actorId = event.actor.type === 'system' ? null : event.actor.id
      if (assigneeId && actorId !== assigneeId) {
        const person = parts.staff.find((p) => p.id === assigneeId)
        if (person?.email) push('employee', person.id, person.email, staffModeResolved)
      }
    } else if (rule === 'client') {
      await pushClient(extModeResolved, false)
    } else if (rule === 'client-neutral') {
      await pushClient(extModeResolved, true)
    } else if (rule === 'broker') {
      // §8: «Брокер подключён — сразу»: подключение — событие
      // согласования. notifyHint.brokerId — ИМЕННО подключаемый брокер
      // (не все уже подключённые), иначе повторное подключение
      // переспамит ранее подключённых.
      const hint = event.notifyHint?.brokerId ? [event.notifyHint.brokerId] : null
      await pushBrokers(hint, isRed ? 'red' : 'immediate')
    } else if (rule === 'client-broker-if-visible') {
      // Письмо — только по ВИДИМОМУ получателю документу: внутренний
      // документ не раскрывает факт существования (Ж2). Предикат
      // видимости — тот же, что у событий ленты (canSeeDocument).
      if (event.documentId) {
        const doc = await tx.document.findUnique({
          where: { id: event.documentId },
          select: { isInternal: true },
        })
        if (doc && !doc.isInternal) {
          await pushClient(extModeResolved, false)
          await pushBrokers(null, extModeResolved)
        }
      }
    }
  }
  return out
}
