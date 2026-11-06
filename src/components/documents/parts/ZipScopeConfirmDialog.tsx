'use client'

import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

// ─── DF-26 §8.1.3: подтверждение «Скачать все документы?» ───────────
// Точные счётчики из того же списка пар (документ, версия), который
// уходит в архив: «Всего N · из них черновики A · на проверке B» —
// расхождение предупреждения с составом исключено по построению.
// Для «выбранных» — тот же подсчёт без текста-предупреждения (§8.1.5).

export function ZipScopeConfirmDialog({
  open,
  scope,
  total,
  drafts,
  review,
  busy,
  onConfirm,
  onCancel,
}: {
  open: boolean
  scope: 'all' | 'selected'
  total: number
  drafts: number
  review: number
  busy: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {scope === 'all' ? 'Скачать все документы?' : 'Скачать выбранные документы?'}
          </DialogTitle>
          <DialogDescription>
            Всего {total}
            {drafts > 0 && ` · из них черновики ${drafts}`}
            {review > 0 && ` · на проверке ${review}`}
          </DialogDescription>
        </DialogHeader>
        {scope === 'all' && (
          <div className="flex items-start gap-2 text-sm border rounded-lg p-3 bg-muted/40">
            <AlertTriangle className="size-4 shrink-0 mt-0.5 text-muted-foreground" aria-hidden />
            <p>
              Архив может содержать черновики и документы, находящиеся на проверке. Финальные
              версии — отдельным сценарием «Скачать финальные (ZIP)».
            </p>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={busy}>
            Отмена
          </Button>
          <Button onClick={onConfirm} disabled={busy || total === 0}>
            {busy ? 'Собираем…' : 'Скачать архив'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
