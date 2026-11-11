'use client'

import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Loader2 } from 'lucide-react'
import { readApiResponse } from '@/lib/api-client'
import type { CustomsCalculationView, FinalPaymentView } from '@/lib/client-customs-types'

// ─── DF-27 волна 2 (Р-5, D73/D41): таможенный расчёт — кабинет клиента ──
// Клиент видит ТОЛЬКО актуальный результат (текущую версию расчёта
// собственной сделки и, на заявке, окончательные платежи по ДТ, если
// внесены). История версий и пересчётов клиенту не отдаётся — её видят
// менеджер и брокер. Все суммы сопровождаются подписью D41
// («Оценка. Окончательные платежи определяются при декларировании»)
// и пометкой «предварительный расчёт».

const fmtDate = (iso: string): string => new Date(iso).toLocaleDateString('ru-RU')

const TOTAL_LABELS: Record<string, string> = {
  customsValueTotal: 'Таможенная стоимость',
  dutyTotal: 'Пошлина',
  addDutyTotal: 'Дополнительная пошлина',
  vatTotal: 'НДС',
  feeRub: 'Таможенный сбор',
  paymentsTotal: 'Платежи (без сбора)',
  grandTotal: 'Итого',
}

export function ClientCustomsResult({
  leadId,
  orderId,
}: {
  leadId?: string
  orderId?: string
}) {
  const [state, setState] = useState<{
    calculation: CustomsCalculationView | null
    finalPayment: FinalPaymentView | null
  } | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const url = leadId
      ? `/api/client/leads/${leadId}/customs-calculation`
      : `/api/client/orders/${orderId}/customs-calculation`
    const res = await fetch(url)
    if (!res.ok) {
      setState({ calculation: null, finalPayment: null })
      setLoading(false)
      return
    }
    const data = await readApiResponse<{ calculation: CustomsCalculationView | null; finalPayment?: FinalPaymentView | null }>(res)
    setState({ calculation: data.calculation ?? null, finalPayment: data.finalPayment ?? null })
    setLoading(false)
  }, [leadId, orderId])

  useEffect(() => {
    void load()
  }, [load])

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 text-muted-foreground text-sm py-4">
          <Loader2 className="size-4 animate-spin" /> Загрузка расчёта…
        </CardContent>
      </Card>
    )
  }
  if (!state || (!state.calculation && !state.finalPayment)) return null

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-medium flex flex-wrap items-center gap-2">
          Таможенный расчёт
          <Badge variant="review">предварительный расчёт</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {state.calculation && (
          <>
            <div className="text-muted-foreground">
              Условие поставки: {state.calculation.incoterm}
              {state.calculation.incotermPlace ? `, ${state.calculation.incotermPlace}` : ''} · расчёт от{' '}
              {fmtDate(state.calculation.calcDate)} · курс на {fmtDate(state.calculation.fxDate)}
            </div>
            <div className="grid gap-1">
              {Object.entries(TOTAL_LABELS)
                .filter(([key]) => state.calculation?.totals[key] !== undefined)
                .map(([key, label]) => (
                  <div key={key} className="flex justify-between gap-4">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="font-medium">{state.calculation?.totals[key]} ₽</span>
                  </div>
                ))}
            </div>
            {state.calculation.items.length > 0 && (
              <div className="text-xs text-muted-foreground">
                Позиции: {state.calculation.items.map((it) => it.hsCode).join(', ')}
              </div>
            )}
          </>
        )}
        {state.finalPayment && (
          <div className="rounded-md border p-3 space-y-1">
            <div className="font-medium">
              Окончательные платежи по ДТ от {fmtDate(state.finalPayment.dtDate)}
            </div>
            {state.finalPayment.lines.map((l, i) => (
              <div key={i} className="flex justify-between gap-4">
                <span className="text-muted-foreground">{l.kind}</span>
                <span className="font-medium">
                  {l.amount} {l.currency}
                </span>
              </div>
            ))}
            {state.finalPayment.note && (
              <div className="text-xs text-muted-foreground">{state.finalPayment.note}</div>
            )}
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          Оценка. Окончательные платежи определяются при декларировании — по применимым правилам и данным
          на дату подачи ДТ.
        </p>
      </CardContent>
    </Card>
  )
}
