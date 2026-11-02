'use client'

import { useEffect, useRef, useState } from 'react'
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
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import { DOC_COMMENT_MAX_LENGTH, formatDocSize } from '@/lib/document-constants'
import { uploadTwoPhase } from '../upload-client'
import { UploadProgress } from '../UploadProgress'
import { fileLabel, type DocRowUi } from './types'

// v0.5.0 (P1-22): диалог новой версии документа — выезд из
// DocumentsSection.tsx (резка под лимит 300, RULES 2.14).
// DF-11: двухфазная загрузка с прогрессом, лимит files.max_mb с сервера.
export function DocumentVersionDialog({
  doc,
  versionsUrlFor,
  maxMb = 25,
  onClose,
  onDone,
}: {
  doc: DocRowUi | null
  versionsUrlFor: (docId: string) => string
  maxMb?: number
  onClose: () => void
  onDone: () => Promise<void>
}) {
  const { toast } = useToast()
  const maxBytes = maxMb * 1024 * 1024

  const [vComment, setVComment] = useState('')
  const [vFile, setVFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)

  const versionFileRef = useRef<HTMLInputElement>(null)

  // Поля сбрасываются при каждом открытии (doc изменился)
  useEffect(() => {
    if (doc) {
      setVComment('')
      setVFile(null)
      setProgress(null)
      if (versionFileRef.current) versionFileRef.current.value = ''
    }
  }, [doc])

  const submitVersion = async () => {
    if (!doc || !vFile) return
    if (vFile.size > maxBytes) {
      toast({
        title: 'Версия не загружена',
        description: `Файл больше ${formatDocSize(maxBytes)} — уменьшите файл или пришлите менеджеру напрямую`,
        variant: 'destructive',
      })
      return
    }
    setBusy(true)
    setProgress(0)
    try {
      await uploadTwoPhase({
        createUrl: versionsUrlFor(doc.id),
        createBody: {
          comment: vComment.trim() || undefined,
          fileName: vFile.name,
          mimeType: vFile.type || '',
          size: vFile.size,
        },
        file: vFile,
        onProgress: setProgress,
      })
      toast({
        title: 'Версия загружена',
        description: `«${doc.title}» — версия ${doc.currentVersion + 1}`,
      })
      onClose()
      await onDone()
    } catch (e) {
      toast({
        title: 'Версия не загружена',
        description: e instanceof Error ? e.message : '',
        variant: 'destructive',
      })
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }

  return (
    <Dialog open={doc !== null} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Новая версия документа</DialogTitle>
          <DialogDescription>
            «{doc?.title}» — текущая версия v{doc?.currentVersion}. Файл до{' '}
            {formatDocSize(maxBytes)}. Правки видят все участники сделки в
            истории версий.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="ver-comment">Что изменено и почему</Label>
            <Textarea
              id="ver-comment"
              value={vComment}
              onChange={(e) => setVComment(e.target.value)}
              placeholder="Например: добавлен пункт об упаковке по замечанию брокера"
              maxLength={DOC_COMMENT_MAX_LENGTH}
              rows={2}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="ver-file">Файл новой версии</Label>
            <input
              ref={versionFileRef}
              id="ver-file"
              type="file"
              className="text-sm"
              onChange={(e) => setVFile(e.target.files?.[0] ?? null)}
            />
            <p className="text-xs text-muted-foreground">{fileLabel(vFile)}</p>
          </div>
{progress !== null && <UploadProgress progress={progress} />}
        </div>
        <DialogFooter>
          <Button onClick={() => void submitVersion()} disabled={busy || !vFile}>
            {busy && <Loader2 className="size-4 animate-spin" />}
            Загрузить версию
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
