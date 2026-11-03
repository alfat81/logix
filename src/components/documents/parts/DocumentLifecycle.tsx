'use client'

import { useState } from 'react'
import { useToast } from '@/hooks/use-toast'
import { CircleCheck, Loader2, Undo2 } from 'lucide-react'
import { readApiResponse } from '@/lib/api-client'
import { DOC_COMMENT_MAX_LENGTH } from '@/lib/document-constants'
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
import type { DocRowUi } from './types'

// DF-12: кнопки жизненного цикла — только для сотрудников (пропс
// lifecycleUrlFor есть лишь у админских страниц): «Финальный» из
// черновика/проверки, «Вернуть в работу» — единственный путь править
// финальный документ, причина обязательна и уходит в журнал сделки.

export function DocumentLifecycle({
  doc,
  urlFor,
  onDone,
}: {
  doc: DocRowUi
  urlFor: (docId: string) => string
  onDone: () => Promise<void>
}) {
  const { toast } = useToast()
  const [busy, setBusy] = useState(false)
  const [reopenOpen, setReopenOpen] = useState(false)
  const [reason, setReason] = useState('')

  const finalize = async () => {
    setBusy(true)
    try {
      const res = await fetch(`${urlFor(doc.id)}/finalize`, { method: 'POST' })
      const data = await readApiResponse<{ error?: string }>(res)
      if (!res.ok) throw new Error(data.error || 'Не удалось финализировать документ')
      toast({
        title: 'Документ финализирован',
        description: `«${doc.title}» — финальная версия v${doc.currentVersion}`,
      })
      await onDone()
    } catch (e) {
      toast({
        title: 'Не удалось финализировать',
        description: e instanceof Error ? e.message : '',
        variant: 'destructive',
      })
    } finally {
      setBusy(false)
    }
  }

  const submitReopen = async () => {
    if (!reason.trim()) return
    setBusy(true)
    try {
      const res = await fetch(`${urlFor(doc.id)}/reopen`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim() }),
      })
      const data = await readApiResponse<{ error?: string }>(res)
      if (!res.ok) throw new Error(data.error || 'Не удалось вернуть документ в работу')
      toast({ title: 'Документ возвращён в работу', description: doc.title })
      setReopenOpen(false)
      setReason('')
      await onDone()
    } catch (e) {
      toast({
        title: 'Не удалось вернуть в работу',
        description: e instanceof Error ? e.message : '',
        variant: 'destructive',
      })
    } finally {
      setBusy(false)
    }
  }

  if (doc.status === 'final') {
    return (
      <>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setReopenOpen(true)}
          disabled={busy}
          title="Снять финальный статус — потребуется причина"
        >
          <Undo2 className="size-4" />
          Вернуть в работу
        </Button>
        <Dialog open={reopenOpen} onOpenChange={(o) => !busy && setReopenOpen(o)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Вернуть документ в работу</DialogTitle>
              <DialogDescription>
                «{doc.title}» перестанет быть финальным — участники снова смогут
                прислать новую версию. Причина попадёт в журнал сделки.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-2">
              <Label htmlFor="doc-reopen-reason">Почему возвращаем</Label>
              <Textarea
                id="doc-reopen-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Например: клиент прислал исправленный инвойс"
                maxLength={DOC_COMMENT_MAX_LENGTH}
                rows={2}
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button onClick={() => void submitReopen()} disabled={busy || !reason.trim()}>
                {busy && <Loader2 className="size-4 animate-spin" />}
                Вернуть в работу
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    )
  }

  return (
    <Button
      size="sm"
      variant="ghost"
      onClick={() => void finalize()}
      disabled={busy}
      title={`Объявить финальным (текущая версия v${doc.currentVersion})`}
    >
      <CircleCheck className="size-4" />
      Финальный
    </Button>
  )
}
