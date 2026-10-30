// ─── DF-05/D45: сборка секции «Ждут дольше N часов» ──────────────────
// Вынесено из /api/admin/attention (IC-09, RULES 2.14: лимит 300 строк).
// Чистая функция без Prisma: строки — плоские данные из select роута.
//
// Правила попадания строки в секцию:
//   • общий порог waiting.attention_hours (мяч висит дольше порога);
//   • D45: запрос с причиной awaiting_client_choice — по РАБОЧИМ дням
//     (≥2, пн–пт МСК): попадает в внимание раньше общего порога и
//     показывается с текстом-действием «уточнить, видел ли клиент
//     расчёт» (followup=true).
// SQL-срез роута для D45 шире точного фильтра (24 ч) — здесь строки,
// «не дозревшие» до 2 рабочих дней, отбрасываются.

import { isChoiceFollowupDue } from '@/lib/waiting'

export type WaitingLongAttention = {
  dealId: string
  dealKind: 'order' | 'lead'
  label: string
  status: string
  waitingOnKind: string
  waitingReason: string | null
  hoursWaiting: number
  followup: boolean
}

// Подпись сделки без привязанного клиента (ручной запрос): имя из
// rawContact — тот же разбор, что у секции «Запросы без движения».
function dealLabel(
  customerName: string | null,
  rawContact: unknown
): string {
  return (
    customerName ??
    (rawContact && typeof rawContact === 'object' && !Array.isArray(rawContact)
      ? String((rawContact as { name?: unknown }).name ?? '—')
      : '—')
  )
}

function hoursWaitingSince(waitingSince: Date | null, now: Date): number {
  return Math.max(
    0,
    Math.floor((now.getTime() - (waitingSince?.getTime() ?? now.getTime())) / (60 * 60 * 1000))
  )
}

export type WaitingLongOrderRow = {
  id: string
  number: string
  status: string
  customer: { name: string } | null
  waitingOnKind: string | null
  waitingSince: Date | null
}

export type WaitingLongLeadRow = {
  id: string
  status: string
  customer: { name: string } | null
  rawContact: unknown
  waitingOnKind: string | null
  waitingReason: string | null
  waitingSince: Date | null
}

export function buildWaitingLong(
  longOrders: WaitingLongOrderRow[],
  longLeads: WaitingLongLeadRow[],
  waitingCutoff: Date,
  now: Date
): WaitingLongAttention[] {
  return [
    ...longOrders.map((o) => ({
      dealId: o.id,
      dealKind: 'order' as const,
      label: `${o.number} · ${dealLabel(o.customer?.name ?? null, null)}`,
      status: o.status,
      waitingOnKind: o.waitingOnKind ?? 'none',
      waitingReason: null,
      hoursWaiting: hoursWaitingSince(o.waitingSince, now),
      followup: false,
    })),
    ...longLeads
      .filter(
        (l) =>
          (l.waitingSince?.getTime() ?? 0) < waitingCutoff.getTime() ||
          (l.waitingReason === 'awaiting_client_choice' &&
            l.waitingSince !== null &&
            isChoiceFollowupDue(l.waitingSince, now))
      )
      .map((l) => ({
        dealId: l.id,
        dealKind: 'lead' as const,
        label: dealLabel(l.customer?.name ?? null, l.rawContact),
        status: l.status,
        waitingOnKind: l.waitingOnKind ?? 'none',
        waitingReason: l.waitingReason ?? null,
        hoursWaiting: hoursWaitingSince(l.waitingSince, now),
        followup: l.waitingReason === 'awaiting_client_choice',
      })),
  ].sort((a, b) => b.hoursWaiting - a.hoursWaiting)
}
