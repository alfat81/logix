import type { EstimatePrefill } from './types'

// ─── DF-19: ответы брокера (DF-18) → предзаполнение строк расчёта ────
// Структурный тип (без импорта типов BrokerLinksSection): работает и
// для связей лида (estimate на связи), и для order.lead.brokers.
// Предпочтение — ОТПРАВЛЕННЫЕ ответы (sent); черновики брокера —
// fallback (это его цифры, менеджер видит пометку статуса в карточке).

type PrefillLink = {
  broker: { companyName: string }
  estimate?: {
    status?: string
    sentAt?: string | null
    updatedAt: string
    items?: {
      id?: string
      hsCode: string
      dutyPercent: number | string | null
      addDutyPercent: number | string | null
      vatPercent: number | string | null
      rateNote?: string | null
    }[] | null
  } | null
}

export function toEstimatePrefill(links: PrefillLink[]): EstimatePrefill[] {
  return links
    .filter((l) => l.estimate)
    .map((l) => ({
      brokerName: l.broker.companyName,
      status: l.estimate?.status ?? 'draft',
      sentAt: l.estimate?.sentAt ?? null,
      updatedAt: l.estimate?.updatedAt ?? '',
      items: (l.estimate?.items ?? []).map((it) => ({
        id: it.id ?? it.hsCode,
        hsCode: it.hsCode,
        dutyPercent: it.dutyPercent,
        addDutyPercent: it.addDutyPercent,
        vatPercent: it.vatPercent,
        rateNote: it.rateNote ?? null,
      })),
    }))
}
