'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useIsMaster } from '@/components/admin/EmployeeRolesProvider'

// ─── DF-26 волна 2 (§9.3): диалог обхода блокировки этапа ──────────
// Вынесен из OrderStages (RULES 2.14, гард IC-09). При 409 гарда
// этапа: список недостающего (чек-листы + разрешительные требования) +
// (только мастеру) комментарий + «Завершить с обходом» —
// override=true + overrideComment в журнал (прецедент P1-05).

export type StageOverrideState = {
  stageId: string
  missing: { label: string; source: 'doc_requirement' | 'permit' }[]
}

export function StageOverrideDialog({
  state,
  onClose,
  onConfirm,
}: {
  state: StageOverrideState | null
  onClose: () => void
  onConfirm: (stageId: string, comment: string) => void
}) {
  const isMaster = useIsMaster()
  const [comment, setComment] = useState('')
  return (
    <Dialog open={state !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Этап нельзя завершить</DialogTitle>
          <DialogDescription>Нет обязательных документов по этому этапу:</DialogDescription>
        </DialogHeader>
        <ul className="grid gap-1.5 text-sm">
          {state?.missing.map((m, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-foreground/60" />
              <span className="min-w-0 break-words">
                {m.label}
                {m.source === 'permit' && (
                  <span className="text-muted-foreground"> (разрешительное требование)</span>
                )}
              </span>
            </li>
          ))}
        </ul>
        {isMaster ? (
          <div className="grid gap-1.5">
            <Label htmlFor="override-comment">Комментарий обхода (в журнал)</Label>
            <Textarea
              id="override-comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Почему завершаем без документов"
              rows={3}
              maxLength={500}
            />
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Обход блокировки выполняет мастер — обратитесь к нему.
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Отмена
          </Button>
          {isMaster && (
            <Button
              disabled={!comment.trim()}
              onClick={() => {
                if (!state) return
                onConfirm(state.stageId, comment.trim())
              }}
            >
              Завершить с обходом
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
