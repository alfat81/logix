'use client'

import { Clock } from 'lucide-react'
import {
  isChoiceFollowupDue,
  WAITING_CHOICE_FOLLOWUP_ACTION,
  WAITING_CHOICE_FOLLOWUP_SHORT,
  WAITING_KIND_LABELS,
  WAITING_REASON_LABELS,
  type WaitingKind,
  type WaitingReason,
} from '@/lib/waiting'

// DF-05 «У кого мяч»: плашка «Ждёт: клиент · 2 дн.» — карточки списков
// (OrderCard/LeadListCard) и страницы заявки/запроса. Данные —
// вычисляемые колонки waitingOn* (lib/waiting-db.ts), приходят в
// проекциях API. Формулировки — только для СОТРУДНИКА: клиентские
// кабинеты получают нейтральный текст из своих проекций (kind=client),
// kind contractor наружу не отдаётся (D31).
//
// Брендбук (D40): нейтральный muted, тёмный текст; красный НЕ
// используется — длительное ожидание красит секция «Ждут дольше N
// часов» на экране «Требует внимания», а не каждая карточка (иначе
// «красный шум», §3.3 брендбука v1.3).

export function WaitingBadge({
  kind,
  reason,
  since,
}: {
  kind: string | null
  reason: string | null
  since: string | null
}) {
  if (!kind || kind === 'none' || !since) return null
  // new Date().getTime() вместо Date.now(): правило чистоты рендера
  // (тот же приём, что в EtaBlock карточки заявки).
  const nowDate = new Date()
  const sinceDate = new Date(since)
  const hours = Math.max(0, Math.floor((nowDate.getTime() - sinceDate.getTime()) / 3_600_000))
  const duration = hours < 24 ? `${hours} ч` : `${Math.floor(hours / 24)} дн.`
  const who = WAITING_KIND_LABELS[kind as WaitingKind] ?? kind
  const why = reason ? (WAITING_REASON_LABELS[reason as WaitingReason] ?? null) : null
  // D45: «несколько вариантов расчёта, выбранного нет» — через 2
  // рабочих дня (пн–пт, МСК) плашка становится действием менеджеру
  // «уточнить расчёт» (до пороги — обычное «Ждёт: клиента»).
  const choiceDue = reason === 'awaiting_client_choice' && isChoiceFollowupDue(sinceDate, nowDate)
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md border bg-muted px-1.5 py-0.5 text-xs text-muted-foreground"
      title={choiceDue ? WAITING_CHOICE_FOLLOWUP_ACTION : (why ?? undefined)}
    >
      <Clock className="size-3 shrink-0" aria-hidden />
      Ждёт: {who} · {duration}
      {choiceDue ? ` — ${WAITING_CHOICE_FOLLOWUP_SHORT}` : ''}
    </span>
  )
}
