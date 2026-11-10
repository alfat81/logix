'use client'

// Поток A волна 1 (BL): диалоги контура согласования — вынесены из
// QuoteOptionsSection (RULES 2.14: файл ≤ 300, integrity IC-09).
// BL-2 «Зафиксировать согласие от имени клиента» (confirm-API; без
// optionId сервер берёт текущий isSelected, без выбранного — выбор
// из списка) и BL-3 «Изменить условия» (сброс согласования — единственный
// путь изменить зафиксированные условия; исторические снимки не трогаются).
import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'
import { readApiResponse } from '@/lib/api-client'
import { LEAD_CONFIRM_VIA_LABELS, type LeadConfirmVia } from '@/lib/leads'
import { Lock } from 'lucide-react'
import type { QuoteOptionRow } from '@/components/admin/QuoteOptionsSection'

export type LeadConfirmationMeta = {
  at: string | null
  via: string | null
  byName: string | null
}

// BL: баннер активного согласования — кто/как/когда + кнопка
// «Изменить условия» (сброс). Условия зафиксированы снимком.
export function LeadApprovalBanner({
  confirmation,
  onChangeConditions,
}: {
  confirmation: LeadConfirmationMeta | null
  onChangeConditions: () => void
}) {
  return (
    <div className="rounded-md border border-success/50 bg-success/5 p-3 text-sm grid gap-2">
      <span className="flex flex-wrap items-center gap-2 font-medium">
        <Lock className="size-4 text-success" />
        Согласовано{confirmation?.at ? ` ${new Date(confirmation.at).toLocaleString('ru-RU', { dateStyle: 'long', timeStyle: 'short' })}` : ''} ·{' '}
        {confirmation?.via
          ? LEAD_CONFIRM_VIA_LABELS[confirmation.via as LeadConfirmVia] ?? confirmation.via
          : '—'}
        {confirmation?.via === 'manager_on_behalf' && confirmation.byName
          ? ` (${confirmation.byName})`
          : ''}
      </span>
      <span className="text-muted-foreground">
        Условия зафиксированы историческим снимком. Изменить состав вариантов
        можно только после сброса согласования.
      </span>
      <div>
        <Button size="sm" variant="outline" onClick={onChangeConditions}>
          Изменить условия
        </Button>
      </div>
    </div>
  )
}

export function LeadConfirmOnBehalfDialog({
  leadId,
  options,
  selectedRow,
  open,
  onOpenChange,
  onConfirmed,
}: {
  leadId: string
  options: QuoteOptionRow[]
  selectedRow: QuoteOptionRow | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirmed: () => void
}) {
  const { toast } = useToast()
  const [confirmOptionId, setConfirmOptionId] = useState('')
  const [confirming, setConfirming] = useState(false)

  const confirmOnBehalf = async (optionId?: string) => {
    setConfirming(true)
    try {
      const res = await fetch(`/api/admin/leads/${leadId}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(optionId ? { optionId } : {}),
      })
      const data = await readApiResponse<{ message?: string; error?: string }>(res)
      if (!res.ok) throw new Error(data.error || 'Не удалось зафиксировать согласие')
      toast({ title: data.message || 'Согласие зафиксировано' })
      onOpenChange(false)
      onConfirmed()
    } catch (e) {
      toast({
        title: 'Ошибка',
        description: e instanceof Error ? e.message : '',
        variant: 'destructive',
      })
    } finally {
      setConfirming(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Зафиксировать согласие от имени клиента</DialogTitle>
          <DialogDescription>
            Сохраняется кто/как/когда: «менеджером от имени клиента».
            Запрос перейдёт в «Согласован клиентом» и будет ждать конвертации.
          </DialogDescription>
        </DialogHeader>
        {!selectedRow && (
          <div className="grid gap-2">
            <span className="text-sm text-muted-foreground">Выберите вариант:</span>
            {options.map((o) => (
              <label
                key={o.id}
                className="flex items-center gap-2 rounded-md border p-2 text-sm cursor-pointer has-[:checked]:border-action-icon"
              >
                <input
                  type="radio"
                  name="confirm-option"
                  className="accent-primary"
                  checked={confirmOptionId === o.id}
                  onChange={() => setConfirmOptionId(o.id)}
                />
                <span className="flex-1">{o.description}</span>
                <span className="tabular-nums">{o.etaDays} дн.</span>
              </label>
            ))}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button
            onClick={() => confirmOnBehalf(selectedRow ? undefined : confirmOptionId)}
            disabled={confirming || (!selectedRow && !confirmOptionId)}
          >
            {confirming && <Loader2 className="size-4 animate-spin" />}
            Зафиксировать согласие
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function LeadResetConfirmationDialog({
  leadId,
  open,
  onOpenChange,
  onReset,
}: {
  leadId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onReset: () => void
}) {
  const { toast } = useToast()
  const [resetting, setResetting] = useState(false)

  const resetConfirmation = async () => {
    setResetting(true)
    try {
      const res = await fetch(`/api/admin/leads/${leadId}/reset-confirmation`, {
        method: 'POST',
      })
      const data = await readApiResponse<{ message?: string; error?: string }>(res)
      if (!res.ok) throw new Error(data.error || 'Не удалось сбросить согласование')
      toast({ title: data.message || 'Согласование сброшено' })
      onOpenChange(false)
      onReset()
    } catch (e) {
      toast({
        title: 'Ошибка',
        description: e instanceof Error ? e.message : '',
        variant: 'destructive',
      })
    } finally {
      setResetting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Изменить условия (сброс согласования)</DialogTitle>
          <DialogDescription>
            Запрос вернётся в «Рассчитан», метаданные согласования очистятся,
            клиенту уйдёт письмо — потребуется повторное согласование
            (кабинетом или от имени клиента). Исторический снимок останется
            в истории неизменным.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button onClick={resetConfirmation} disabled={resetting}>
            {resetting && <Loader2 className="size-4 animate-spin" />}
            Сбросить согласование
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
