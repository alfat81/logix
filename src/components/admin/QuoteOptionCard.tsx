'use client'

import { useState } from 'react'
import { History, Pencil, Trash2, Wand2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import { readApiResponse } from '@/lib/api-client'
import { QUOTE_PRIORITY_FIT_LABELS, type QuotePriorityFit } from '@/lib/leads'
import {
  CURRENCIES,
  VAT_MODES,
  formatMoneyWithVat,
  formatMoney,
  type CurrencyCode,
  type VatModeCode,
} from '@/lib/money'
import { QuoteOptionHistory, HistoryToggle } from '@/components/admin/QuoteOptionHistory'

// ─── DF-27 волна 1: карточка варианта (план §10.3–10.4) ─────────────
// Признаки: выбран / предварительный / требует пересмотра цены /
// отличается от запроса; итоги расчёта (staff); «История варианта»
// (ревизии); «Заполнить из запроса» для легаси-варианта (без снимков).

export type QuoteOptionRow = {
  id: string
  description: string
  transportModes: string[] | null
  // Decimal из API приходит строкой (toJSON Decimal.js)
  price: string
  currency: string
  vatMode: string
  costEstimate: string | null
  costCurrency: string
  etaDays: number
  priorityFit: string
  isSelected: boolean
  // DF-27: снимки/provenance/расчёт/предварительность (staff-проекция;
  // в клиентском кабинете свои поля — CLIENT_OPTION_FIELDS)
  isPreliminary?: boolean
  priceReviewRequired?: boolean
  routeSnapshot?: unknown
  calcTotals?: { total: number } | null
  diffFromLead?: Array<{ key: string; label: string }> | null
  updatedByName?: string | null
}

export function QuoteOptionCard({
  option,
  locked,
  onSelect,
  onEdit,
  onDelete,
  onFillFromLead,
}: {
  option: QuoteOptionRow
  locked: boolean
  onSelect: () => void
  onEdit: () => void
  onDelete: () => void
  onFillFromLead: () => void
}) {
  const { toast } = useToast()
  const [historyOpen, setHistoryOpen] = useState(false)
  const [filling, setFilling] = useState(false)

  const modes = Array.isArray(option.transportModes)
    ? option.transportModes.filter((m): m is string => typeof m === 'string')
    : []
  const currency: CurrencyCode = (CURRENCIES as readonly string[]).includes(option.currency)
    ? (option.currency as CurrencyCode)
    : 'RUB'
  const vatMode: VatModeCode = (VAT_MODES as readonly string[]).includes(option.vatMode)
    ? (option.vatMode as VatModeCode)
    : 'WITHOUT_VAT'
  const costCurrency: CurrencyCode = (CURRENCIES as readonly string[]).includes(option.costCurrency)
    ? (option.costCurrency as CurrencyCode)
    : 'RUB'
  const isLegacy = option.routeSnapshot === null || option.routeSnapshot === undefined

  const fillFromLead = async () => {
    setFilling(true)
    try {
      const res = await fetch(`/api/admin/options/${option.id}/fill-from-lead`, { method: 'POST' })
      const data = await readApiResponse<{ message?: string; error?: string }>(res)
      if (!res.ok) throw new Error(data.error || 'Не удалось заполнить из запроса')
      toast({ title: data.message || 'Вариант заполнен из запроса' })
      onFillFromLead()
    } catch (e) {
      toast({
        title: 'Ошибка',
        description: e instanceof Error ? e.message : '',
        variant: 'destructive',
      })
    } finally {
      setFilling(false)
    }
  }

  return (
    <Card className={option.isSelected ? 'p-4 border-action-icon border-2' : 'p-4 border-l-4 border-l-transparent'}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="min-w-52 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium">{option.description}</span>
            {option.isSelected && (
              <Badge className="bg-primary text-primary-foreground border-transparent">Выбран</Badge>
            )}
            {option.isPreliminary && (
              <Badge variant="outline" className="text-amber-600 border-amber-600">
                Предварительный
              </Badge>
            )}
            {option.priceReviewRequired && (
              <Badge variant="outline" className="text-danger border-destructive">
                Требует актуализации расчёта
              </Badge>
            )}
            {option.diffFromLead && option.diffFromLead.length > 0 && (
              <Badge variant="outline" className="text-muted-foreground">
                Отличается от запроса
              </Badge>
            )}
          </div>
          <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-2 mt-1">
            {modes.length > 0 && (
              <span className="flex gap-1">
                {modes.map((m) => (
                  <Badge key={m} variant="outline" className="text-xs">
                    {m}
                  </Badge>
                ))}
              </span>
            )}
            <span>срок: {option.etaDays} дн.</span>
            <span>
              · ориентир: {QUOTE_PRIORITY_FIT_LABELS[option.priorityFit as QuotePriorityFit] ?? option.priorityFit}
            </span>
            {option.costEstimate !== null && (
              <span>· себестоимость: {formatMoney(option.costEstimate, costCurrency)}</span>
            )}
            {option.calcTotals && (
              <span>· расчёт: {formatMoney(option.calcTotals.total, currency)}</span>
            )}
            {isLegacy && <span>· данные — как в запросе</span>}
          </div>
        </div>
        <div className="font-semibold tabular-nums whitespace-nowrap">
          {formatMoneyWithVat(option.price, currency, vatMode)}
        </div>
        <div className="flex items-center gap-1">
          {!locked && !option.isSelected && (
            <Button variant="outline" size="sm" onClick={onSelect}>
              Выбрать
            </Button>
          )}
          {!locked && isLegacy && (
            <Button variant="ghost" size="sm" onClick={fillFromLead} disabled={filling}>
              <Wand2 className="size-4" />
              Заполнить из запроса
            </Button>
          )}
          <HistoryToggle open={historyOpen} onToggle={() => setHistoryOpen((v) => !v)} />
          {!locked && (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                onClick={onEdit}
                title="Править вариант"
              >
                <Pencil className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-8 text-danger hover:text-danger"
                onClick={onDelete}
                title="Удалить вариант"
              >
                <Trash2 className="size-4" />
              </Button>
              {!historyOpen && <History className="hidden size-4" aria-hidden />}
            </>
          )}
        </div>
      </div>
      <QuoteOptionHistory optionId={option.id} open={historyOpen} />
    </Card>
  )
}
