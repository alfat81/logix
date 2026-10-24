'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'
import { readApiResponse } from '@/lib/api-client'
import { parseMoneyInput } from '@/lib/money'
import type { QuoteOptionRow } from '@/components/admin/QuoteOptionsSection'
import {
  EMPTY_OPTION_FORM,
  QuoteOptionFormFields,
  type OptionForm,
} from '@/components/admin/QuoteOptionFormFields'

// ─── Диалог добавления/правки варианта расчёта (В3, деньги P1-04) ──
// Состояние формы и сохранение; поля — QuoteOptionFormFields
// (RULES 2.14: файлы ≤ 300 строк). Деньги (RULES 2.15, D19): цена
// клиенту + валюта + метка НДС и себестоимость — раздельные поля;
// себестоимость остаётся внутри (наружу не выходит), маржа не
// вычисляется. Разбор ввода — только parseMoneyInput, до 2 знаков
// после запятой.

export function QuoteOptionDialog({
  open,
  onOpenChange,
  leadId,
  editing,
  onSaved,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  leadId: string
  editing: QuoteOptionRow | null
  onSaved: () => void
}) {
  const { toast } = useToast()
  const [optionForm, setOptionForm] = useState<OptionForm>({ ...EMPTY_OPTION_FORM })
  const [savingOption, setSavingOption] = useState(false)

  // Предзаполнение: editing (правка) или пустая форма (добавление)
  useEffect(() => {
    if (!open) return
    if (!editing) {
      setOptionForm({ ...EMPTY_OPTION_FORM })
      return
    }
    setOptionForm({
      description: editing.description,
      price: String(editing.price),
      currency: editing.currency,
      vatMode: editing.vatMode,
      cost: editing.costEstimate === null ? '' : String(editing.costEstimate),
      costCurrency: editing.costCurrency,
      etaDays: String(editing.etaDays),
      priorityFit: editing.priorityFit,
      modes: Array.isArray(editing.transportModes)
        ? editing.transportModes.filter((m): m is string => typeof m === 'string')
        : [],
    })
  }, [open, editing])

  const saveOption = async () => {
    const description = optionForm.description.trim()
    const price = parseMoneyInput(optionForm.price)
    const cost = optionForm.cost.trim() ? parseMoneyInput(optionForm.cost) : null
    const eta = Number(optionForm.etaDays.replace(',', '.'))
    if (!description) {
      toast({ title: 'Опишите вариант расчёта', variant: 'destructive' })
      return
    }
    if (price === null) {
      toast({
        title: 'Цена — число, больше нуля, до 2 знаков после запятой',
        variant: 'destructive',
      })
      return
    }
    if (optionForm.cost.trim() && cost === null) {
      toast({
        title: 'Себестоимость — число, до 2 знаков после запятой',
        variant: 'destructive',
      })
      return
    }
    if (!Number.isInteger(eta) || eta <= 0) {
      toast({ title: 'Срок — целое число дней, больше нуля', variant: 'destructive' })
      return
    }
    setSavingOption(true)
    try {
      const body = {
        description,
        price,
        currency: optionForm.currency,
        vatMode: optionForm.vatMode,
        // правка: пустое поле себестоимости = очистить (null);
        // создание: не передаём — колонка останется NULL
        ...(editing ? { costEstimate: cost } : cost !== null ? { costEstimate: cost } : {}),
        costCurrency: optionForm.costCurrency,
        etaDays: eta,
        priorityFit: optionForm.priorityFit,
        ...(optionForm.modes.length ? { transportModes: optionForm.modes } : {}),
      }
      const res = editing
        ? await fetch(`/api/admin/options/${editing.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          })
        : await fetch(`/api/admin/leads/${leadId}/options`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          })
      const data = await readApiResponse<{ message?: string; error?: string }>(res)
      if (!res.ok) throw new Error(data.error || 'Не удалось сохранить вариант')
      toast({ title: data.message || 'Вариант расчёта сохранён' })
      onOpenChange(false)
      onSaved()
    } catch (e) {
      toast({
        title: 'Ошибка',
        description: e instanceof Error ? e.message : '',
        variant: 'destructive',
      })
    } finally {
      setSavingOption(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? 'Править вариант' : 'Добавить вариант'}</DialogTitle>
        </DialogHeader>
        <QuoteOptionFormFields
          form={optionForm}
          onChange={(patch) => setOptionForm((f) => ({ ...f, ...patch }))}
        />
        <DialogFooter>
          <Button onClick={saveOption} disabled={savingOption}>
            {savingOption && <Loader2 className="size-4 animate-spin" />}
            {editing ? 'Сохранить' : 'Добавить'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
