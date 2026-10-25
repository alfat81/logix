'use client'

import { useRef, useState } from 'react'
import { Loader2, Plus } from 'lucide-react'
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
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { readApiResponse } from '@/lib/api-client'
import {
  DOC_COMMENT_MAX_LENGTH,
  DOC_FILE_MAX_BYTES,
  DOC_TITLE_MAX_LENGTH,
  DOCUMENT_TYPES,
  DOCUMENT_TYPE_LABELS,
  formatDocSize,
  type DocumentType,
} from '@/lib/document-constants'
import { fileLabel } from './types'

// v0.5.0 (P1-22): диалог загрузки документа — выезд из
// DocumentsSection.tsx (резка под лимит 300, RULES 2.14). Логика 1:1:
// multipart POST (тип/название/комментарий/видимость/файл), кнопка в
// шапке секции рендерится этим же компонентом.
export function DocumentCreateDialog({
  documentsUrl,
  canMarkInternal,
  onCreated,
}: {
  documentsUrl: string
  canMarkInternal: boolean
  onCreated: () => Promise<void>
}) {
  const { toast } = useToast()

  const [createOpen, setCreateOpen] = useState(false)
  const [cType, setCType] = useState<DocumentType>('accompanying')
  const [cTitle, setCTitle] = useState('')
  const [cComment, setCComment] = useState('')
  const [cInternal, setCInternal] = useState(false)
  const [cFile, setCFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)

  const resetCreateForm = () => {
    setCTitle('')
    setCComment('')
    setCInternal(false)
    setCFile(null)
    setCType('accompanying')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const submitCreate = async () => {
    if (!cFile || !cTitle.trim()) return
    setBusy(true)
    try {
      const fd = new FormData()
      fd.append('type', cType)
      fd.append('title', cTitle.trim())
      if (cComment.trim()) fd.append('comment', cComment.trim())
      if (cInternal) fd.append('isInternal', 'true')
      fd.append('file', cFile)
      const res = await fetch(documentsUrl, { method: 'POST', body: fd })
      const data = await readApiResponse<{ error?: string }>(res)
      if (!res.ok) throw new Error(data.error || 'Не удалось загрузить документ')
      toast({ title: 'Документ загружен', description: cTitle.trim() })
      setCreateOpen(false)
      resetCreateForm()
      await onCreated()
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
      <Button size="sm" variant="outline" onClick={() => setCreateOpen(true)}>
        <Plus className="size-4" />
        Загрузить документ
      </Button>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Новый документ</DialogTitle>
            <DialogDescription>
              Файл до {formatDocSize(DOC_FILE_MAX_BYTES)}: PDF, картинка, DOC/DOCX,
              XLS/XLSX, ZIP.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="doc-type">Тип документа</Label>
              <Select value={cType} onValueChange={(v) => setCType(v as DocumentType)}>
                <SelectTrigger id="doc-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DOCUMENT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {DOCUMENT_TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="doc-title">Название</Label>
              <Input
                id="doc-title"
                value={cTitle}
                onChange={(e) => setCTitle(e.target.value)}
                placeholder="Инвойс № INV-123, упаковочный лист…"
                maxLength={DOC_TITLE_MAX_LENGTH}
              />
            </div>
            {canMarkInternal && (
              <div className="grid gap-2">
                <Label>Видимость</Label>
                <Select
                  value={cInternal ? 'internal' : 'shared'}
                  onValueChange={(v) => setCInternal(v === 'internal')}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="shared">Всем участникам сделки</SelectItem>
                    <SelectItem value="internal">Только сотрудникам</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Внутренние (договоры с подрядчиками, тарифы) не видны клиенту и брокеру.
                </p>
              </div>
            )}
            <div className="grid gap-2">
              <Label htmlFor="doc-comment">Комментарий (необязательно)</Label>
              <Textarea
                id="doc-comment"
                value={cComment}
                onChange={(e) => setCComment(e.target.value)}
                placeholder="Что это и зачем — увидят все участники сделки"
                maxLength={DOC_COMMENT_MAX_LENGTH}
                rows={2}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="doc-file">Файл</Label>
              <input
                ref={fileInputRef}
                id="doc-file"
                type="file"
                className="text-sm"
                onChange={(e) => setCFile(e.target.files?.[0] ?? null)}
              />
              <p className="text-xs text-muted-foreground">{fileLabel(cFile)}</p>
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => void submitCreate()}
              disabled={busy || !cFile || !cTitle.trim()}
            >
              {busy && <Loader2 className="size-4 animate-spin" />}
              Загрузить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
