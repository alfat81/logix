import type { Prisma } from '@prisma/client'
import type { ActivityActor, ActivityTarget, ActivityType } from '@/lib/activity'
import { getSetting } from '@/lib/settings'
import { resolveRecipients, type ResolvedDealEvent } from './rules'
import { renderSingleLetter, type DealRef } from './templates'
import { nextWindowTime } from './windows'

// ─── DF-03: постановка уведомлений в очередь (внутри транзакции) ─────
// Карточка DF-03: «enqueueNotifications(tx, event) — внутри транзакции,
// createMany({ skipDuplicates: true })». Вызывается из emitEvent
// (lib/events.ts) ПОСЛЕ записи Activity в той же транзакции: сбой
// постановки откатывает операцию целиком (инвариант §1 п. 2), сбой
// ОТПРАВКИ — не влияет на пользователя (повторяет диспетчер).
//
// Дедупликация одиночных писем (immediate/red): ключ
// `${type}:${kind}:${recipient}:${target}:${floor(ts/10мин)}` — шторм
// одинаковых событий в 10 минут даёт одно письмо (карточка DF-03).
// regular-строки НЕ дедуплицируются по окну: каждая несёт свой факт в
// дайджест, потеря строки = потеря события из письма, — ключ содержит
// id события и уникален по построению.
//
// Антишторм «красных» (D33): notifications.red_max_per_hour ОТПРАВЛЕННЫХ
// писем получателю за час; сверх лимита письмо не пропадает —
// откладывается до ближайшего окна (nextAttemptAt) с тем же красным
// префиксом темы («сверх лимита — в ближайшее окно с пометкой "срочно"»).

export type QueuedEventInput = {
  eventId: string
  type: ActivityType
  actor: ActivityActor
  target: ActivityTarget | null
  stageId: string | null
  documentId: string | null
  notifyHint: { brokerId?: string } | null
  description: string
}

// Окно дедупликации одиночных писем — технический параметр (карточка
// DF-03 фиксирует 10 минут), не бизнес-настройка (D32).
const DEDUP_BUCKET_MS = 10 * 60 * 1000
// Фолбэк ожидания для отложенных красных при пустых окнах.
const RED_DEFER_FALLBACK_MS = 60 * 60 * 1000

async function dealRefOf(
  tx: Prisma.TransactionClient,
  target: NonNullable<QueuedEventInput['target']>
): Promise<DealRef | null> {
  if ('orderId' in target) {
    const order = await tx.order.findUnique({
      where: { id: target.orderId },
      select: { number: true, customer: { select: { name: true } } },
    })
    if (!order) return null
    return { kind: 'order', id: target.orderId, label: `заявка №${order.number}` }
  }
  if ('leadId' in target) {
    const lead = await tx.lead.findUnique({
      where: { id: target.leadId },
      select: { customer: { select: { name: true } } },
    })
    if (!lead) return null
    const name = lead.customer?.name
    return { kind: 'lead', id: target.leadId, label: name ? `запрос — ${name}` : 'запрос' }
  }
  return null
}

export async function enqueueNotifications(
  tx: Prisma.TransactionClient,
  event: QueuedEventInput
): Promise<number> {
  const target = event.target
  if (!target || (!('orderId' in target) && !('leadId' in target))) return 0
  const deal = await dealRefOf(tx, target)
  if (!deal) return 0

  const resolved: ResolvedDealEvent = {
    type: event.type,
    actor: event.actor,
    target,
    stageId: event.stageId,
    documentId: event.documentId,
    notifyHint: event.notifyHint,
  }
  const envelopes = await resolveRecipients(tx, resolved)
  if (envelopes.length === 0) return 0

  const [redTypes, redMax, windows, tz] = await Promise.all([
    getSetting('notifications.red_event_types'),
    getSetting('notifications.red_max_per_hour'),
    getSetting('notifications.client_digest_times'),
    getSetting('notifications.timezone'),
  ])
  const isRedEvent = redTypes.includes(event.type)
  const now = new Date()
  const bucket = Math.floor(now.getTime() / DEDUP_BUCKET_MS)
  const targetId = 'orderId' in target ? target.orderId : target.leadId
  const hourAgo = new Date(now.getTime() - 60 * 60 * 1000)

  // Счётчик красных по получателю: отправленные за час + запланированные
  // этим же вызовом (пачка красных событий одного прогона не должна
  // проскочить мимо лимита из-за того, что письма ещё pending).
  const redPlanned = new Map<string, number>()

  const rows: Prisma.NotificationCreateManyInput[] = []
  for (const env of envelopes) {
    let mode = env.mode
    let nextAttemptAt: Date | null = mode === 'regular' ? null : now
    if (isRedEvent || env.mode === 'red') {
      mode = 'red'
      const key = `${env.kind}:${env.recipientId ?? env.to}`
      const sent = await tx.notification.count({
        where: {
          mode: 'red',
          status: 'sent',
          recipientKind: env.kind,
          recipientId: env.recipientId,
          sentAt: { gte: hourAgo },
        },
      })
      const planned = redPlanned.get(key) ?? 0
      if (sent + planned >= redMax) {
        // Шторм: держим красный режим, но откладываем до ближайшего окна.
        nextAttemptAt = nextWindowTime(windows, tz, now) ?? new Date(now.getTime() + RED_DEFER_FALLBACK_MS)
      } else {
        redPlanned.set(key, planned + 1)
      }
    }
    const draft = await renderSingleLetter(event.type, event.description, { ...env, mode }, deal)
    rows.push({
      recipientKind: env.kind,
      recipientId: env.recipientId,
      toAddress: env.to,
      channel: 'email',
      mode,
      eventId: event.eventId,
      type: event.type,
      subject: draft.subject,
      body: draft.body,
      status: 'pending',
      attempts: 0,
      nextAttemptAt,
      windowKey: null,
      dedupKey:
        mode === 'regular'
          ? `${event.type}:${env.kind}:${env.recipientId ?? `company:${env.to}`}:${targetId}:ev:${event.eventId}`
          : `${event.type}:${env.kind}:${env.recipientId ?? `company:${env.to}`}:${targetId}:${bucket}`,
    })
  }
  const res = await tx.notification.createMany({ data: rows, skipDuplicates: true })
  return res.count
}
