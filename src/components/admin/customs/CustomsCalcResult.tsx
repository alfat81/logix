'use client'

import { formatMoney } from '@/lib/money'
import { CUSTOMS_EVALUATION_NOTE } from '@/lib/customs'
import { Badge } from '@/components/ui/badge'
import { fmtRu, fmtRuDateTime, type CustomsCalcRow } from './types'

// ─── DF-19: просмотр сохранённого расчёта (итоги + строки) ───────────
// Деньги — только formatMoney (IC-09); подпись «Оценка…» обязательна
// рядом с любыми цифрами расчёта (D41).

export function CustomsCalcResult({ calc, compact }: { calc: CustomsCalcRow; compact?: boolean }) {
  const t = calc.totals
  const fx = calc.fxRates ?? {}
  const fxList = Object.entries(fx).filter(([code]) => code !== 'RUB')
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span>
          <span className="text-muted-foreground">Таможенная стоимость: </span>
          <span className="font-semibold tabular-nums">{formatMoney(t.customsValueTotal)}</span>
        </span>
        <span className="text-muted-foreground">
          курс от {fmtRu(calc.fxDate)}
          {Number(calc.fxReservePercent) > 0 ? ` · запас ${Number(calc.fxReservePercent)}%` : ''}
          {fxList.length > 0 && ` (${fxList.map(([code, e]) => `${code} ${Number(e.rate).toFixed(4)}`).join(', ')})`}
        </span>
      </div>

      {compact ? (
        // DF-21: панель 320px — пятиколоночная сетка не помещается:
        // каждая строка — блок «код» + пары «поле: значение».
        <div className="rounded-md border grid">
          {calc.items.map((it) => (
            <div key={it.id} className="grid gap-1 px-2 py-1.5 text-xs border-b last:border-b-0">
              <span className="font-mono font-medium" title={it.hsCode}>
                {it.hsCode}
              </span>
              <div className="grid gap-0.5">
                <Pair label="ТС" value={formatMoney(it.customsValue)} />
                <Pair
                  label="Пошлина"
                  value={
                    formatMoney(it.duty) +
                    (it.addDuty && Number(it.addDuty) !== 0 ? ` + доп. ${formatMoney(it.addDuty)}` : '')
                  }
                />
                <Pair label="НДС" value={formatMoney(it.vat)} />
                <Pair label="Начислено" value={formatMoney(it.allocatedCosts)} muted />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-md border grid">
          <div className="grid grid-cols-[7rem_1fr_1fr_1fr_1fr] gap-2 px-2 py-1 text-xs text-muted-foreground border-b bg-muted/40">
            <span>Код ТН ВЭД</span>
            <span className="text-right">ТС, ₽</span>
            <span className="text-right">Пошлина</span>
            <span className="text-right">НДС</span>
            <span className="text-right">Начислено</span>
          </div>
          {calc.items.map((it) => (
            <div
              key={it.id}
              className="grid grid-cols-[7rem_1fr_1fr_1fr_1fr] gap-2 px-2 py-1 text-xs border-b last:border-b-0 items-baseline"
            >
              <span className="font-mono truncate" title={it.hsCode}>
                {it.hsCode}
              </span>
              <span className="tabular-nums text-right">{formatMoney(it.customsValue)}</span>
              <span className="tabular-nums text-right">
                {formatMoney(it.duty)}
                {it.addDuty && Number(it.addDuty) !== 0 ? ` + доп. ${formatMoney(it.addDuty)}` : ''}
              </span>
              <span className="tabular-nums text-right">{formatMoney(it.vat)}</span>
              <span className="tabular-nums text-right text-muted-foreground">{formatMoney(it.allocatedCosts)}</span>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-md border bg-muted/30 p-3 grid gap-1 text-sm">
        <Row label="Пошлина" value={t.dutyTotal} />
        {Number(t.addDutyTotal) !== 0 && <Row label="Доп. пошлина" value={t.addDutyTotal} />}
        <Row label="НДС" value={t.vatTotal} />
        {t.feeRub != null && (
          <Row label={calc.feeManual ? 'Сбор (вручную)' : 'Сбор по шкале'} value={t.feeRub} />
        )}
        <div className="border-t pt-1">
          <Row label="Всего таможенные платежи" value={t.paymentsTotal} strong />
        </div>
        {t.brokerFeeRub != null && (
          <div className="border-t pt-1">
            <Row label="Вознаграждение брокера за ДТ (вне платежей)" value={t.brokerFeeRub} />
          </div>
        )}
        {t.brokerFeeRub != null && (
          <div>
            <Row label="Итого к оплате" value={t.grandTotal} strong />
          </div>
        )}
      </div>

      <div className="text-xs text-muted-foreground italic">{CUSTOMS_EVALUATION_NOTE}</div>
      <div className="text-xs text-muted-foreground">
        Правила {calc.rulesVersion} · автор: {calc.createdByName} · сохранён {fmtRuDateTime(calc.createdAt)}
      </div>
    </div>
  )
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className={strong ? 'font-medium' : 'text-muted-foreground'}>{label}</span>
      <span className={strong ? 'font-semibold tabular-nums' : 'tabular-nums'}>{formatMoney(value)}</span>
    </div>
  )
}

// DF-21 (compact): пара «поле: значение» в стопке строк расчёта.
function Pair({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <span className="flex items-baseline justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className={muted ? 'tabular-nums text-muted-foreground' : 'tabular-nums'}>{value}</span>
    </span>
  )
}

// Строка истории (isCurrent=false): дата, условие, платежи, автор.
export function HistoryRow({ calc }: { calc: CustomsCalcRow }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs border-b last:border-b-0 py-1.5">
      <span className="text-muted-foreground tabular-nums">{fmtRu(calc.createdAt)}</span>
      <span className="font-mono">
        {calc.incoterm}
        {calc.incotermPlace ? ` · ${calc.incotermPlace}` : ''}
      </span>
      <span className="tabular-nums">{formatMoney(calc.totals.paymentsTotal)}</span>
      {!calc.isCurrent && (
        <Badge variant="outline" className="text-xs text-muted-foreground">
          архив
        </Badge>
      )}
      <span className="ml-auto text-muted-foreground">{calc.createdByName}</span>
    </div>
  )
}
