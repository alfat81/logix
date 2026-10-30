import { db } from '@/lib/db'
import { EVENT_TYPES } from '@/lib/event-registry'
import { getBrand } from '@/lib/brand'
import { getSetting } from '@/lib/settings'
import { fmtPermitDate } from '@/lib/permits'
import { dueWindow, windowKeyOf } from './windows'
import { dealLink, renderFooter, type DealRef } from './templates'
import type { RecipientKind } from './rules'

// ─── DF-03: дайджест — накопленные regular-письма одним письмом ──────
// Карточка DF-03: «для каждого получателя собирает накопленные
// regular-уведомления за период в одно письмо, сгруппированное по
// заявкам: что произошло и блок "ждём от вас" (waitingOn, DF-05,
// включая разрешительные DF-16)». Блок «ждём от вас» появится вместе
// с DF-05/DF-16 — точка расширения помечена ниже.
//
// Окно считается исполненным, если вызов диспетчера пришёл в течение
// 15 минут после его начала (допуск планировщика — windows.ts);
// пропущенное окно не исполняется задним числом — содержимое уезжает
// в следующее (строки остаются pending, ничего не теряется).
//
// Пустое письмо НЕ отправляется (D33): получатель без накопленных
// строк пропускается. Лимит notifications.max_regular_per_day считает
// дайджесты текущих суток получателя (дата — в поясе рассылок).
// Идемпотентность — dedupKey = digest:{kind}:{recipient}:{дата}:{окно}
// (уникальный индекс): повторный вызов не создаст второй дайджест.
//
// Накопленные строки после ухода дайджеста помечаются sent c
// providerId = digest:<id> — письмо доставлено СОСТАВОМ дайджеста
// (аудит отправок DF-04 видит и факты, и их судьбу).

// Потолок выборки за один проход диспетчера — технический параметр.
const TAKE_LIMIT = 500

export type DigestRun = {
  window: string | null
  digests: number
  included: number
}

type AccRow = {
  id: string
  recipientKind: string
  recipientId: string | null
  toAddress: string
  eventId: string | null
}

function recipientKey(row: AccRow): string {
  return `${row.recipientKind}:${row.recipientId ?? `company:${row.toAddress}`}`
}

export async function processRegularDigests(at: Date = new Date()): Promise<DigestRun> {
  const [windows, tz, maxPerDay] = await Promise.all([
    getSetting('notifications.client_digest_times'),
    getSetting('notifications.timezone'),
    getSetting('notifications.max_regular_per_day'),
  ])
  const w = dueWindow(windows, tz, at)
  if (!w) return { window: null, digests: 0, included: 0 }
  const wKey = windowKeyOf(tz, w, at)
  const dateStr = wKey.slice(0, wKey.indexOf(':'))

  const pending = await db.notification.findMany({
    where: { mode: 'regular', type: { not: 'digest' }, status: 'pending' },
    orderBy: { createdAt: 'asc' },
    take: TAKE_LIMIT,
    select: {
      id: true,
      recipientKind: true,
      recipientId: true,
      toAddress: true,
      eventId: true,
    },
  })
  if (pending.length === 0) return { window: w, digests: 0, included: 0 }

  const groups = new Map<string, AccRow[]>()
  for (const row of pending) {
    const key = recipientKey(row)
    const list = groups.get(key)
    if (list) list.push(row)
    else groups.set(key, [row])
  }

  const brand = await getBrand()
  const footer = await renderFooter()
  let digests = 0
  let included = 0

  for (const [key, rows] of groups) {
    const first = rows[0]
    const kind = first.recipientKind as RecipientKind
    // Лимит обычных писем в сутки (D33) — по созданным дайджестам
    // сегодняшней даты (в любом статусе: созданный в этом окне тоже
    // занимает слот, защита от гонки двух вызовов диспетчера).
    const sentToday = await db.notification.count({
      where: {
        type: 'digest',
        recipientKind: kind,
        recipientId: first.recipientId,
        windowKey: { startsWith: `${dateStr}:` },
      },
    })
    if (sentToday >= maxPerDay) continue

    // Содержимое: события строк группируются по сделке (§8: «одно
    // письмо, сгруппированное по заявкам»).
    const eventIds = rows.map((r) => r.eventId).filter((v): v is string => Boolean(v))
    const acts = eventIds.length
      ? await db.activity.findMany({
          where: { id: { in: eventIds } },
          select: { id: true, orderId: true, leadId: true, type: true, description: true },
        })
      : []
    const byId = new Map(acts.map((a) => [a.id, a]))

    const dealIds = {
      orders: [...new Set(acts.map((a) => a.orderId).filter((v): v is string => Boolean(v)))],
      leads: [...new Set(acts.map((a) => a.leadId).filter((v): v is string => Boolean(v)))],
    }
    const [orders, leads] = await Promise.all([
      dealIds.orders.length
        ? db.order.findMany({
            where: { id: { in: dealIds.orders } },
            select: { id: true, number: true },
          })
        : Promise.resolve([]),
      dealIds.leads.length
        ? db.lead.findMany({
            where: { id: { in: dealIds.leads } },
            select: { id: true, customer: { select: { name: true } } },
          })
        : Promise.resolve([]),
    ])
    const orderNumbers = new Map(orders.map((o) => [o.id, o.number]))
    const leadNames = new Map(
      leads.map((l) => [l.id, l.customer?.name ? `запрос — ${l.customer.name}` : 'запрос'])
    )

    const dealOf = (a: { orderId: string | null; leadId: string | null }): DealRef | null => {
      if (a.orderId && orderNumbers.has(a.orderId)) {
        return { kind: 'order', id: a.orderId, label: `заявка №${orderNumbers.get(a.orderId)}` }
      }
      if (a.leadId && leadNames.has(a.leadId)) {
        return { kind: 'lead', id: a.leadId, label: leadNames.get(a.leadId) as string }
      }
      return null
    }

    // ── DF-16: блок «Ждём от вас» (карточка DF-16, п. (в)) ──────────
    // Незакрытые разрешительные, которые должен предоставить САМ
    // получатель (client→client, broker→broker, сотрудник→staff), —
    // под своим блоком сделки, как продолжение её событий.
    const waitProvider = kind === 'client' ? 'client' : kind === 'broker' ? 'broker' : 'staff'
    const waitPermits = await db.permitRequirement.findMany({
      where: {
        status: 'pending',
        providedBy: waitProvider,
        OR: [
          { orderId: { in: dealIds.orders } },
          { leadId: { in: dealIds.leads } },
        ],
      },
      select: { title: true, neededBy: true, orderId: true, leadId: true },
      orderBy: [{ isBlocking: 'desc' }, { neededBy: 'asc' }],
      take: 50,
    })
    const waitsByDeal = new Map<string, { title: string; neededBy: Date | null }[]>()
    for (const p of waitPermits) {
      const key = p.orderId ? `order:${p.orderId}` : p.leadId ? `lead:${p.leadId}` : ''
      if (!key) continue
      const list = waitsByDeal.get(key)
      if (list) list.push({ title: p.title, neededBy: p.neededBy })
      else waitsByDeal.set(key, [{ title: p.title, neededBy: p.neededBy }])
    }

    // Порядок сделок — по первому событию; строки внутри — хронологически
    // (pending отсортирован по createdAt, acts — поMap; восстанавливаем
    // порядок по строкам).
    const lines: string[] = [`${brand.name} — обновления (окно ${w}):`, '']
    const dealOrder: string[] = []
    const dealLines = new Map<string, string[]>()
    for (const row of rows) {
      const act = row.eventId ? byId.get(row.eventId) : null
      if (!act) continue // событие удалено вместе со сделкой (каскад) — строку пропускаем
      const deal = dealOf(act)
      const dKey = deal ? `${deal.kind}:${deal.id}` : 'other'
      if (!dealLines.has(dKey)) {
        dealOrder.push(dKey)
        dealLines.set(dKey, deal ? [`— ${deal.label}:`] : ['— Прочее:'])
      }
      const label = EVENT_TYPES[act.type as keyof typeof EVENT_TYPES]?.label ?? act.type
      dealLines.get(dKey)!.push(`  • ${label}: ${act.description}`)
    }
    // Ссылки — по одной на сделку в конце её блока.
    for (const dKey of dealOrder) {
      const block = dealLines.get(dKey)!
      const dealAct = acts.find((a) => {
        const d = dealOf(a)
        return d ? `${d.kind}:${d.id}` === dKey : dKey === 'other'
      })
      if (dealAct) {
        const deal = dealOf(dealAct)
        if (deal) {
          const link = dealLink(kind, deal)
          if (link) block.push(`  Открыть: ${link}`)
        }
      }
      // DF-16: «Ждём от вас» — в конце блока своей сделки.
      for (const w of waitsByDeal.get(dKey) ?? []) {
        block.push(`  Ждём от вас: ${w.title}${w.neededBy ? ` — срок ${fmtPermitDate(w.neededBy)}` : ''}`)
      }
      lines.push(...block, '')
    }
    lines.push(footer)

    const subject = `${brand.name}: обновления по сделкам (окно ${w})`
    const body = lines.join('\n')
    const dedupKey = `digest:${key}:${dateStr}:${w}`
    try {
      const created = await db.notification.create({
        data: {
          recipientKind: kind,
          recipientId: first.recipientId,
          toAddress: first.toAddress,
          channel: 'email',
          mode: 'regular',
          eventId: null,
          type: 'digest',
          subject,
          body,
          status: 'pending',
          attempts: 0,
          nextAttemptAt: at,
          windowKey: wKey,
          dedupKey,
        },
        select: { id: true },
      })
      await db.notification.updateMany({
        where: { id: { in: rows.map((r) => r.id) } },
        data: { status: 'sent', sentAt: at, providerId: `digest:${created.id}` },
      })
      digests += 1
      included += rows.length
    } catch (e) {
      // P2002 (дубликат dedupKey) — дайджест этого окна уже создан
      // параллельным вызовом: строки НЕ помечаем, они уйдут его составом
      // (тот вызов пометит их сам). Прочие ошибки — следующий вызов повторит.
      const code = (e as { code?: string }).code
      if (code !== 'P2002') throw e
    }
  }
  return { window: w, digests, included }
}
