'use client'

import { useEffect, useRef, useState } from 'react'
import { FileUp, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'
import { formatDocSize } from '@/lib/document-constants'
import { uploadTwoPhase } from '@/components/documents/upload-client'
import { UploadProgress } from '@/components/documents/UploadProgress'
import type { PermitRowUi } from './types'

// ─── DF-16 × DF-11: закрытие строки разрешительного загрузкой ────────
// «Кто закрывает: клиент, брокер или сотрудник — загрузкой документа
// прямо в строке». Двухфазная загрузка: pending-документ вида permit →
// presigned PUT (с прогрессом) → confirm с permitRequirementId — строка
// становится received в той же транзакции. Повторная загрузка закрытой
// строки не предлагается — документ правится версиями в «Документах».
export function PermitUploadButton({
  permit,
  documentUrl,
  maxMb = 25,
  onUploaded,
}: {
  permit: PermitRowUi
  documentUrl: (permitId: string) => string
  maxMb?: number
  onUploaded: () => Promise<void>
}) {
  const { toast } = useToast()
  const maxBytes = maxMb * 1024 * 1024
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)
  const [title, setTitle] = useState(permit.title)
  const [comment, setComment] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setTitle(permit.title)
      setComment('')
      setFile(null)
      setProgress(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }, [open, permit])

  const submit = async () => {
    if (!file) return
    if (file.size > maxBytes) {
      toast({
        title: 'Документ не загружен',
        description: `Файл больше ${formatDocSize(maxBytes)} — уменьшите файл или пришлите менеджеру напрямую`,
        variant: 'destructive',
      })
      return
    }
    setBusy(true)
    setProgress(0)
    try {
      await uploadTwoPhase({
        createUrl: documentUrl(permit.id),
        createBody: {
          title: title.trim() || undefined, // по умолчанию — название строки
          comment: comment.trim() || undefined,
          fileName: file.name,
          mimeType: file.type || '',
          size: file.size,
        },
        // Строка закрывается тем же документом на шаге confirm (DF-16).
        confirmBody: { permitRequirementId: permit.id },
        file,
        onProgress: setProgress,
      })
      toast({ title: 'Документ загружен — строка закрыта', description: title.trim() })
      setOpen(false)
      await onUploaded()
    } catch (e) {
      toast({
        title: 'Документ не загружен',
        description: e instanceof Error ? e.message : '',
        variant: 'destructive',
      })
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <FileUp className="size-3.5" />
        Загрузить документ
      </Button>
      <Dialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Документ по «{permit.title}»</DialogTitle>
            <DialogDescription>
              Файл до {formatDocSize(maxBytes)}: PDF, картинка, DOC/DOCX,
              XLS/XLSX, ZIP. Строка закроется статусом «Получен».
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="permit-doc-title">Название документа</Label>
              <Input
                id="permit-doc-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={200}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="permit-doc-comment">Комментарий (необязательно)</Label>
              <Input
                id="permit-doc-comment"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Номер оригинала, срок действия…"
                maxLength={500}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="permit-doc-file">Файл</Label>
              <input
                ref={fileInputRef}
                id="permit-doc-file"
                type="file"
                className="text-sm"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </div>
{progress !== null && <UploadProgress progress={progress} />}
          </div>
          <DialogFooter>
            <Button onClick={() => void submit()} disabled={busy || !file}>
              {busy && <Loader2 className="size-4 animate-spin" />}
              Загрузить и закрыть
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
