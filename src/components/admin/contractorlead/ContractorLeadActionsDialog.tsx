'use client'

import { useEffect, useState } from 'react'
import { Loader2, Trash2, UserCheck, UserMinus, UserPlus, XCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import { readApiResponse } from '@/lib/api-client'
import { ContractorLeadStatusBadge } from './ContractorLeadStatusBadge'
import { RawInfoView } from './RawInfoView'
import { fmtLeadDate, type ContractorLeadRow } from './types'

// v0.5.0 (P1-22): диалог кандидата (анкета + переходы), отказ с
// причиной и удаление — выезд из ContractorLeadsSection.tsx (резка
// под лимит 300, RULES 2.14). Логика 1:1: переходы — руками менеджера;
// отказ симметричен lostReason (причина обязательна, кандидат не
// терминален); удаление — только без родившегося подрядчика
// (сервер 409, кнопка отражает правило).
export function ContractorLeadActionsDialog({
  lead,
  onClose,
  patchLead,
  onOpenContract,
  onDeleted,
}: {
  lead: ContractorLeadRow | null
  onClose: () => void
  patchLead: (lead: ContractorLeadRow, body: Record<string, unknown>) => Promise<boolean>
  onOpenContract: (lead: ContractorLeadRow) => void
  onDeleted: () => void
}) {
  const { toast } = useToast()

  // Отказ с причиной
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [rejecting, setRejecting] = useState(false)

  // Удаление (без родившегося подрядчика)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // При отказе поле очищается при каждом открытии
  useEffect(() => {
    if (lead) setRejectReason('')
  }, [lead])

  const handleReject = async () => {
    if (!lead) return
    if (!rejectReason.trim()) {
      toast({ title: 'Укажите причину отказа', variant: 'destructive' })
      return
    }
    setRejecting(true)
    const ok = await patchLead(lead, { status: 'rejected', rejectReason: rejectReason.trim() })
    setRejecting(false)
    if (ok) setRejectOpen(false)
  }

  const handleDelete = async () => {
    if (!lead) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/admin/contractor-leads/${lead.id}`, { method: 'DELETE' })
      const data = await readApiResponse<{ message?: string; error?: string }>(res)
      if (!res.ok) throw new Error(data.error || 'Не удалось удалить кандидата')
      toast({ title: data.message || 'Кандидат удалён' })
      setDeleteOpen(false)
      onDeleted()
    } catch (e) {
      toast({
        title: 'Ошибка',
        description: e instanceof Error ? e.message : '',
        variant: 'destructive',
      })
      setDeleting(false)
    }
  }

  const current = lead

  return (
    <>
      {/* Диалог кандидата: анкета + переходы */}
      <Dialog open={!!current} onOpenChange={(open) => !open && onClose()}>
        {current && (
          <DialogContent className="sm:max-w-xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex flex-wrap items-center gap-2">
                {current.companyName}
                <ContractorLeadStatusBadge status={current.status} />
              </DialogTitle>
              <DialogDescription>
                Кандидат от {fmtLeadDate(current.createdAt)} ·{' '}
                {current.contractor
                  ? `подрядчик в пуле: ${current.contractor.companyName}`
                  : 'переходы — руками менеджера'}
              </DialogDescription>
            </DialogHeader>

            <RawInfoView rawInfo={current.rawInfo} />

            {current.status === 'rejected' && current.rejectReason && (
              <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm">
                <span className="text-muted-foreground">Причина отказа: </span>
                {current.rejectReason}
              </div>
            )}

            {current.contractor && (
              <div className="rounded-md border px-3 py-2 text-sm flex flex-wrap items-center gap-2">
                <span className="text-muted-foreground">Подрядчик:</span>
                <span className="font-medium">{current.contractor.companyName}</span>
                <span className="text-muted-foreground">{current.contractor.phone}</span>
                {current.contractor.isActive ? (
                  <Badge variant="delivered">в пуле</Badge>
                ) : (
                  <Badge variant="version">исключён</Badge>
                )}
              </div>
            )}

            <DialogFooter className="flex-wrap gap-2 sm:flex-wrap">
              {current.status === 'new' && (
                <Button
                  variant="outline"
                  onClick={() => patchLead(current, { status: 'qualifying' })}
                >
                  <UserCheck className="size-4" />
                  В квалификацию
                </Button>
              )}
              {current.status === 'rejected' && (
                <Button
                  variant="outline"
                  onClick={() => patchLead(current, { status: 'qualifying' })}
                >
                  <UserCheck className="size-4" />
                  Вернуть в квалификацию
                </Button>
              )}
              {(current.status === 'new' || current.status === 'qualifying') && (
                <>
                  <Button variant="outline" onClick={() => setRejectOpen(true)}>
                    <XCircle className="size-4" />
                    Отказ…
                  </Button>
                  <Button onClick={() => onOpenContract(current)}>
                    <UserPlus className="size-4" />
                    Перевести в пул…
                  </Button>
                </>
              )}
              {/* contracted терминален; удаление — только без подрядчика
                  (сервер 409, кнопка — отражение правила, как с
                  обязательными этапами в Б3/Б5) */}
              {!current.contractor && (
                <Button
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  onClick={() => setDeleteOpen(true)}
                >
                  <Trash2 className="size-4" />
                  Удалить
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      {/* Отказ с причиной (обязательна — симметрия lostReason) */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Отказ — {current?.companyName}</DialogTitle>
            <DialogDescription>
              Причина обязательна. Кандидат не терминален: вернуть в квалификацию можно
              будет в любой момент.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            rows={3}
            placeholder="Например: нет допусков на опасные грузы"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
          />
          <DialogFooter>
            <Button variant="destructive" onClick={handleReject} disabled={rejecting}>
              {rejecting && <Loader2 className="size-4 animate-spin" />}
              Отклонить кандидата
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Удаление кандидата */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Удалить кандидата «{current?.companyName}»?</DialogTitle>
            <DialogDescription>
              Удалить можно только кандидата без родившегося подрядчика. Анкета пропадёт
              безвозвратно.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Отмена
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting && <Loader2 className="size-4 animate-spin" />}
              <UserMinus className="size-4" />
              Удалить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
