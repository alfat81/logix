'use client'

import { CalendarClock } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { fmtDuty, fmtPercent, isManualRate, readPermits } from '@/lib/brokers'

// ─── DF-18: просмотр ответа брокера в карточках сделки (админка) ────
// Блок «Платежи · статус · строки кодов · разрешительные · примечания»
// под карточкой брокера в BrokerLinksSection (вынесен по RULES 2.14 —
// файл ≤ 300 строк). Толерантен к старым ответам: статус/строки могут
// отсутствовать (ответы до релиза DF-18).

export type BrokerEstimateItemRow = {
  // DF-19: id строки — ссылка brokerItemId в расчёте (предзаполнение
  // «Из ответа брокера» сохраняет происхождение строки)
  id?: string
  hsCode: string
  isManualCode?: boolean
  dutyPercent: number | string | null
  addDutyPercent: number | string | null
  addDutyNote?: string | null
  vatPercent: number | string | null
  rateNote?: string | null
  sortOrder?: number
}

export type BrokerEstimateRow = {
  // P1-04: Decimal из API приходит строкой (раньше — число)
  customsDutyEstimate: number | string | null
  requiredPermits: unknown
  notes: string | null
  // DF-18: статус ответа и строки кодов (у старых ответов — undefined,
  // чтение толерантное)
  status?: string
  sentAt?: string | null
  items?: BrokerEstimateItemRow[]
  createdAt: string
  updatedAt: string
}

const fmtDateTime = (iso: string): string =>
  new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

export function EstimateView({ estimate }: { estimate: BrokerEstimateRow }) {
  const permits = readPermits(estimate.requiredPermits)
  const items = estimate.items ?? []
  return (
    <div className="grid gap-1 text-sm border-t pt-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span>
          <span className="text-muted-foreground">Платежи: </span>
          <span className="font-semibold tabular-nums">{fmtDuty(estimate.customsDutyEstimate)}</span>
        </span>
        {/* DF-18: статус ответа — черновик или отправлен */}
        {estimate.status === 'sent' ? (
          <Badge variant="outline" className="text-xxs">
            отправлен
            {estimate.sentAt ? ` ${new Date(estimate.sentAt).toLocaleDateString('ru-RU')}` : ''}
          </Badge>
        ) : estimate.status === 'draft' ? (
          <Badge variant="outline" className="text-xxs text-muted-foreground">
            черновик
          </Badge>
        ) : null}
        <span className="text-xs text-muted-foreground flex items-center gap-1">
          <CalendarClock className="size-3" />
          обновлена {fmtDateTime(estimate.updatedAt)}
        </span>
      </div>
      {/* DF-18: строки «код · пошлина % · доп. % · НДС %» — подсказка ЕТТ
          и расчёты в рублях придут с DF-19; здесь — то, что внёс брокер */}
      {items.length > 0 && (
        <div className="rounded-md border grid">
          <div className="grid grid-cols-[7rem_1fr_1fr_1fr] gap-2 px-2 py-1 text-xxs text-muted-foreground border-b bg-muted/40">
            <span>Код ТН ВЭД</span>
            <span>Пошлина</span>
            <span>Доп. пошлина</span>
            <span>НДС</span>
          </div>
          {items.map((it) => (
            <div
              key={it.hsCode}
              className="grid grid-cols-[7rem_1fr_1fr_1fr] gap-2 px-2 py-1 text-xs border-b last:border-b-0 items-baseline"
            >
              <span className="font-mono">
                {it.hsCode}
                {it.isManualCode && <span className="ml-1 text-muted-foreground">(вручную)</span>}
              </span>
              <span className="tabular-nums">
                {fmtPercent(it.dutyPercent)}
                {isManualRate(it) && it.rateNote ? ` (${it.rateNote})` : ''}
              </span>
              <span className="tabular-nums">
                {fmtPercent(it.addDutyPercent)}
                {it.addDutyNote ? ` (${it.addDutyNote})` : ''}
              </span>
              <span className="tabular-nums">{fmtPercent(it.vatPercent)}</span>
            </div>
          ))}
        </div>
      )}
      {permits.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Разрешительные:</span>
          {permits.map((p) => (
            <Badge key={p} variant="outline" className="text-xxs">
              {p}
            </Badge>
          ))}
        </div>
      )}
      {estimate.notes && <div className="text-xs text-muted-foreground">{estimate.notes}</div>}
    </div>
  )
}
