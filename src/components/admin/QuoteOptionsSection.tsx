'use client'

import { useState } from 'react'
import { Layers, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'
import { readApiResponse } from '@/lib/api-client'
import { QuoteOptionDialog } from '@/components/admin/QuoteOptionDialog'
import {
  QuoteOptionCard,
  type QuoteOptionRow as QuoteOptionCardRow,
} from '@/components/admin/QuoteOptionCard'
import type { LeadBlankView } from '@/components/admin/QuoteOptionRouteBlocks'
import {
  LeadApprovalBanner,
  LeadConfirmOnBehalfDialog,
  LeadResetConfirmationDialog,
} from '@/components/admin/lead/LeadApprovalDialogs'

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

export type QuoteOptionRow = QuoteOptionCardRow

export function QuoteOptionsSection({
  leadId,
  options,
  disabled,
  // Поток A (BL): статус лида и метаданные согласования — баннер,
  // блокировка правки, «Зафиксировать согласие от имени»/«Изменить условия»
  leadStatus,
  confirmation,
  // DF-27: бланк запроса (блок 1 диалога) и готовность (вычисляемая,
  // из staff-проекции GET карточки — ТЗ §2.3)
  leadBlank,
  leadCompleteness,
  onChanged,
}: {
  leadId: string
  options: QuoteOptionRow[]
  disabled: boolean
  leadStatus?: string
  confirmation?: {
    at: string | null
    via: string | null
    byName: string | null
  } | null
  leadBlank: LeadBlankView
  leadCompleteness?: { ready: boolean; missing: string[] } | null
  onChanged: () => void
}) {
  const { toast } = useToast()

  // Диалог добавления/правки (форма живёт в QuoteOptionDialog)
  const [optionOpen, setOptionOpen] = useState(false)
  const [editingOption, setEditingOption] = useState<QuoteOptionRow | null>(null)
  // BL-2/BL-3: диалоги вынесены в lead/LeadApprovalDialogs.tsx
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [resetOpen, setResetOpen] = useState(false)

  const approved = leadStatus === 'client_approved'
  const optionsLocked = disabled || approved
  const selectedRow = options.find((o) => o.isSelected) ?? null

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

  // BL-2: «Зафиксировать согласие от имени клиента» — confirm-API;
  // без optionId сервер возьмёт текущий выбранный вариант
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Layers className="size-4 text-muted-foreground" />
          Варианты расчёта
        </CardTitle>
        <CardAction className="flex items-center gap-2">
          {/* BL-2: фиксация согласия от имени — для «Рассчитан» */}
          {leadStatus === 'calculated' && options.length > 0 && (
            <Button
              size="sm"
              onClick={() => setConfirmOpen(true)}
            >
              Зафиксировать согласие от имени клиента
            </Button>
          )}
          {!optionsLocked && (
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
          )}
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-2">
        {/* BL: баннер активного согласования — lead/LeadApprovalDialogs.tsx */}
        {approved && (
          <LeadApprovalBanner
            confirmation={confirmation ?? null}
            onChangeConditions={() => setResetOpen(true)}
          />
        )}
        {options.length === 0 ? (
          <span className="text-muted-foreground text-sm">
            Вариантов пока нет. Первый добавленный вариант переведёт запрос в «Рассчитан».
          </span>
        ) : (
          options.map((o) => (
            <QuoteOptionCard
              key={o.id}
              option={o}
              locked={optionsLocked}
              onSelect={() => selectOption(o)}
              onEdit={() => {
                setEditingOption(o)
                setOptionOpen(true)
              }}
              onDelete={() => deleteOption(o)}
              onFillFromLead={onChanged}
            />
          ))
        )}
      </CardContent>

      <QuoteOptionDialog
        open={optionOpen}
        onOpenChange={setOptionOpen}
        leadId={leadId}
        editing={editingOption}
        leadBlank={leadBlank}
        leadCompleteness={leadCompleteness}
        onSaved={onChanged}
      />

      {/* BL-2/BL-3: диалоги согласования — lead/LeadApprovalDialogs.tsx */}
      <LeadConfirmOnBehalfDialog
        leadId={leadId}
        options={options}
        selectedRow={selectedRow}
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        onConfirmed={onChanged}
      />
      <LeadResetConfirmationDialog
        leadId={leadId}
        open={resetOpen}
        onOpenChange={setResetOpen}
        onReset={onChanged}
      />
    </Card>
  )
}
