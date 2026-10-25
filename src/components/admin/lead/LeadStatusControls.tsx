'use client'

// Управление статусом лида (В2) — вынесено из LeadCard при резке
// (P1-19): селект статуса + диалог отказа с обязательной причиной +
// кнопка удаления (только лид без заявки) с подтверждением.
// won в ручной смене недоступен (В2: только конвертацией, API В2: 409).
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import { readApiResponse } from '@/lib/api-client'
import { LEAD_STATUS_LABELS, type LeadStatus } from '@/lib/leads'

export function LeadStatusControls({
  leadId,
  status,
  hasOrder,
  optionsCount,
  patchLead,
}: {
  leadId: string
  status: LeadStatus
  hasOrder: boolean
  optionsCount: number
  patchLead: (body: Record<string, unknown>) => Promise<boolean>
}) {
  const router = useRouter()
  const { toast } = useToast()

  // Проигрыш (В2: lost + обязательная причина)
  const [lostOpen, setLostOpen] = useState(false)
  const [lostReason, setLostReason] = useState('')
  const [losing, setLosing] = useState(false)
  // Удаление (В2: только лид без заявки)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const onStatusChange = (v: string) => {
    if (v === 'lost') {
      setLostReason('')
      setLostOpen(true)
      return
    }
    void patchLead({ status: v })
  }

  const confirmLost = async () => {
    if (!lostReason.trim()) {
      toast({ title: 'Укажите причину отказа', variant: 'destructive' })
      return
    }
    setLosing(true)
    const ok = await patchLead({ status: 'lost', lostReason: lostReason.trim() })
    setLosing(false)
    if (ok) setLostOpen(false)
  }

  const doDelete = async () => {
    setDeleting(true)
    try {
      const res = await fetch(`/api/admin/leads/${leadId}`, { method: 'DELETE' })
      const data = await readApiResponse<{ message?: string; error?: string }>(res)
      if (!res.ok) throw new Error(data.error || 'Не удалось удалить запрос')
      toast({ title: data.message || 'Запрос удалён' })
      router.push('/admin/leads')
    } catch (e) {
      toast({
        title: 'Ошибка',
        description: e instanceof Error ? e.message : '',
        variant: 'destructive',
      })
      setDeleting(false)
    }
  }

  const isWon = status === 'won'

  return (
    <div className="ml-auto flex items-center gap-2">
      {!isWon && (
        <Select value={status} onValueChange={onStatusChange}>
          <SelectTrigger size="sm" className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {/* won в ручной смене недоступен (В2: только конвертацией) */}
            {(['new', 'calculated', 'lost'] as const).map((s) => (
              <SelectItem key={s} value={s}>
                {LEAD_STATUS_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {!hasOrder && (
        <Button
          variant="ghost"
          size="icon"
          className="size-8 text-destructive hover:text-destructive"
          onClick={() => setDeleteOpen(true)}
          title="Удалить запрос"
        >
          <Trash2 className="size-4" />
        </Button>
      )}

      {/* Диалог: проигрыш с причиной (В2) */}
      <Dialog open={lostOpen} onOpenChange={setLostOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Отказ по запросу</DialogTitle>
            <DialogDescription>
              Причина обязательна — она останется в истории воронки (уход
              из отказа её очистит).
            </DialogDescription>
          </DialogHeader>
          <Textarea
            rows={3}
            placeholder="Например: дорого, клиент выбрал другого экспедитора"
            value={lostReason}
            onChange={(e) => setLostReason(e.target.value)}
          />
          <DialogFooter>
            <Button variant="destructive" onClick={confirmLost} disabled={losing}>
              {losing && <Loader2 className="size-4 animate-spin" />}
              Отметить отказом
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Диалог: удаление лида (В2: только без заявки) */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Удалить запрос?</DialogTitle>
            <DialogDescription>
              Запрос будет удалён вместе с его вариантами расчёта
              {optionsCount > 0 ? ` (${optionsCount} шт.)` : ''}. Действие
              необратимо; запрос с заявкой удалить нельзя.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Отмена
            </Button>
            <Button variant="destructive" onClick={doDelete} disabled={deleting}>
              {deleting && <Loader2 className="size-4 animate-spin" />}
              Удалить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
