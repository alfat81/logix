'use client'

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
import type { ContractorRow } from './types'

// v0.5.0 (P1-22): подтверждение мягкого исключения/возврата
// (PATCH isActive, Г3) — выезд из ContractorPoolEditDialog.tsx (резка
// под лимит 300, RULES 2.14). Тост говорит, что именно произошло;
// диалог остаётся открытым для немедленного отката («Вернуть»).
export function ContractorPoolToggleDialog({
  contractor,
  open,
  onOpenChange,
  onDone,
  onRowFresh,
  onContractorChanged,
}: {
  contractor: ContractorRow
  open: boolean
  onOpenChange: (open: boolean) => void
  onDone: () => void
  onRowFresh: (row: ContractorRow) => void
  onContractorChanged?: () => void
}) {
  const { toast } = useToast()
  const [toggling, setToggling] = useState(false)

  const handleToggleActive = async () => {
    setToggling(true)
    try {
      const res = await fetch(`/api/admin/contractors/${contractor.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !contractor.isActive }),
      })
      const data = await readApiResponse<{ message?: string; error?: string }>(res)
      if (!res.ok) throw new Error(data.error || 'Не удалось обновить')
      toast({ title: data.message || 'Обновлено' })
      onOpenChange(false)
      // Список перечитывается, но диалог правки НЕ закрывается — он
      // нужен для немедленного отката («Вернуть»)
      onDone()
      // Статус пула (в пуле/исключён) отражается в карточке кандидата —
      // сигнал воронке перечитать список.
      onContractorChanged?.()
      // Подрядчик только что ПОКИНУЛ текущий фильтр (в пуле →
      // исключённые) и из перечитанного списка его не достать —
      // добираем свежий ряд напрямую, иначе диалог откатится к
      // устаревшему ряду с бейджем «в пуле».
      const fresh = await fetch('/api/admin/contractors').then((r) =>
        readApiResponse<{ contractors: ContractorRow[] }>(r)
      )
      const me = fresh.contractors?.find((c) => c.id === contractor.id)
      if (me) onRowFresh(me)
    } catch (e) {
      toast({
        title: 'Ошибка',
        description: e instanceof Error ? e.message : '',
        variant: 'destructive',
      })
      setToggling(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {contractor.isActive
              ? `Исключить «${contractor.companyName}» из пула?`
              : `Вернуть «${contractor.companyName}» в пул?`}
          </DialogTitle>
          <DialogDescription>
            {contractor.isActive
              ? 'Мягкое исключение: на новые этапы подрядчик не назначается, но вход в ЛК и текущие назначения живут — сорванные перевозки недопустимы.'
              : 'Подрядчик снова доступен для назначения на этапы.'}
            {contractor.isActive && contractor._count.stages > 0
              ? ` Сейчас назначено этапов: ${contractor._count.stages}.`
              : ''}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button
            variant={contractor.isActive ? 'destructive' : 'default'}
            onClick={handleToggleActive}
            disabled={toggling}
          >
            {toggling && <Loader2 className="size-4 animate-spin" />}
            {contractor.isActive ? 'Исключить' : 'Вернуть'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
