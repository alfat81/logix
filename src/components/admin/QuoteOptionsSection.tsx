'use client'

import { useState } from 'react'
import { Layers, Pencil, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import { QuoteOptionDialog } from '@/components/admin/QuoteOptionDialog'

// ─── Варианты расчёта лида (В3) + деньги P1-04 ─────────────────────
// Секция карточки лида: список вариантов + диалог добавления/правки
// (QuoteOptionDialog). Вынесена из LeadCard (RULES 2.14: файл ≤ 300
// строк, D15). Деньги (RULES 2.15, D19): цена клиенту (валюта + метка
// НДС) и себестоимость — раздельно; себестоимость видна только
// сотрудникам (наружу не выходит), маржа не вычисляется. Формат —
// только formatMoney/formatMoneyWithVat (lib/money.ts).
//
// v0.7.10 (DF-22): секция — эталонная обёртка Card (CardTitle
// text-base с иконкой, действие — CardAction в заголовке, как у
// брокеров) вместо голого h2 text-lg; пустое состояние — строка muted
// в CardContent, как у секции брокеров.

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
}

export function QuoteOptionsSection({
  leadId,
  options,
  disabled,
  onChanged,
}: {
  leadId: string
  options: QuoteOptionRow[]
  disabled: boolean
  onChanged: () => void
}) {
  const { toast } = useToast()

  // Диалог добавления/правки (форма живёт в QuoteOptionDialog)
  const [optionOpen, setOptionOpen] = useState(false)
  const [editingOption, setEditingOption] = useState<QuoteOptionRow | null>(null)

  const selectOption = async (o: QuoteOptionRow) => {
    const res = await fetch(`/api/admin/options/${o.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isSelected: true }),
    })
    const data = await readApiResponse<{ message?: string; error?: string }>(res)
    if (!res.ok) {
      toast({ title: data.error || 'Ошибка', variant: 'destructive' })
      return
    }
    toast({ title: 'Вариант выбран' })
    onChanged()
  }

  const deleteOption = async (o: QuoteOptionRow) => {
    const res = await fetch(`/api/admin/options/${o.id}`, { method: 'DELETE' })
    const data = await readApiResponse<{ message?: string; error?: string }>(res)
    if (!res.ok) {
      toast({ title: data.error || 'Не удалось удалить вариант', variant: 'destructive' })
      return
    }
    toast({ title: data.message || 'Вариант удалён' })
    onChanged()
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Layers className="size-4 text-muted-foreground" />
          Варианты расчёта
        </CardTitle>
        {!disabled && (
          <CardAction>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setEditingOption(null)
                setOptionOpen(true)
              }}
            >
              <Plus className="size-4" />
              Добавить вариант
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="grid gap-2">
        {options.length === 0 ? (
          <span className="text-muted-foreground text-sm">
            Вариантов пока нет. Первый добавленный вариант переведёт запрос в «Рассчитан».
          </span>
        ) : (
          options.map((o) => {
            const modes = Array.isArray(o.transportModes)
              ? o.transportModes.filter((m): m is string => typeof m === 'string')
              : []
            const currency: CurrencyCode = (CURRENCIES as readonly string[]).includes(o.currency)
              ? (o.currency as CurrencyCode)
              : 'RUB'
            const vatMode: VatModeCode = (VAT_MODES as readonly string[]).includes(o.vatMode)
              ? (o.vatMode as VatModeCode)
              : 'WITHOUT_VAT'
            const costCurrency: CurrencyCode = (CURRENCIES as readonly string[]).includes(
              o.costCurrency,
            )
              ? (o.costCurrency as CurrencyCode)
              : 'RUB'
            return (
              <Card
                key={o.id}
                className={
                  o.isSelected ? 'p-4 border-action-icon border-2' : 'p-4 border-l-4 border-l-transparent'
                }
              >
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <div className="min-w-52 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{o.description}</span>
                      {o.isSelected && (
                        <Badge className="bg-primary text-primary-foreground border-transparent">
                          Выбран
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
                      <span>срок: {o.etaDays} дн.</span>
                      <span>· ориентир: {QUOTE_PRIORITY_FIT_LABELS[o.priorityFit as QuotePriorityFit] ?? o.priorityFit}</span>
                      {/* Себестоимость — только сотрудникам (сервер наружу
                          её не отдаёт, D3); справа от ориентиров не мешает */}
                      {o.costEstimate !== null && (
                        <span>
                          · себестоимость: {formatMoney(o.costEstimate, costCurrency)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="font-semibold tabular-nums whitespace-nowrap">
                    {formatMoneyWithVat(o.price, currency, vatMode)}
                  </div>
                  {!disabled && (
                    <div className="flex items-center gap-1">
                      {!o.isSelected && (
                        <Button variant="outline" size="sm" onClick={() => selectOption(o)}>
                          Выбрать
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        onClick={() => {
                          setEditingOption(o)
                          setOptionOpen(true)
                        }}
                        title="Править вариант"
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 text-destructive hover:text-destructive"
                        onClick={() => deleteOption(o)}
                        title="Удалить вариант"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  )}
                </div>
              </Card>
            )
          })
        )}
      </CardContent>

      <QuoteOptionDialog
        open={optionOpen}
        onOpenChange={setOptionOpen}
        leadId={leadId}
        editing={editingOption}
        onSaved={onChanged}
      />
    </Card>
  )
}
