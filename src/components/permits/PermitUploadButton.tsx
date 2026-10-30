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
import { readApiResponse } from '@/lib/api-client'
import { DOC_FILE_MAX_BYTES, formatDocSize } from '@/lib/document-constants'
import type { PermitRowUi } from './types'

// ─── DF-16: закрытие строки разрешительного загрузкой документа ──────
// Карточка: «кто закрывает: клиент, брокер или сотрудник — загрузкой
// документа прямо в строке». multipart POST /permits/[id]/document —
// тот же parseDocumentCreateForm, что у контура Е (reюз), статус строки
// станет received. Повторная загрузка закрытой строки не предлагается —
// документ правится версиями в секции «Документы» (409 API).
export function PermitUploadButton({
  permit,
  documentUrl,
  onUploaded,
}: {
  permit: PermitRowUi
  documentUrl: (permitId: string) => string
  onUploaded: () => Promise<void>
}) {
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [title, setTitle] = useState(permit.title)
  const [comment, setComment] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setTitle(permit.title)
      setComment('')
      setFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }, [open, permit])

  const submit = async () => {
    if (!file) return
    setBusy(true)
    try {
      const fd = new FormData()
      // Тип документа фиксирован «Разрешительный» (document-constants),
      // название по умолчанию — название строки обязательства
      fd.append('type', 'permit')
      fd.append('title', title.trim() || permit.title)
      if (comment.trim()) fd.append('comment', comment.trim())
      fd.append('file', file)
      const res = await fetch(documentUrl(permit.id), { method: 'POST', body: fd })
      const data = await readApiResponse<{ error?: string }>(res)
      if (!res.ok) throw new Error(data.error || 'Не удалось загрузить документ')
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
    }
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <FileUp className="size-3.5" />
        Загрузить документ
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Документ по «{permit.title}»</DialogTitle>
            <DialogDescription>
              Файл до {formatDocSize(DOC_FILE_MAX_BYTES)}: PDF, картинка, DOC/DOCX,
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
