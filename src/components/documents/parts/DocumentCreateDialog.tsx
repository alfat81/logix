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
import {
  DOC_COMMENT_MAX_LENGTH,
  DOC_TITLE_MAX_LENGTH,
  DOCUMENT_TYPES,
  DOCUMENT_TYPE_LABELS,
  formatDocSize,
  type DocumentType,
} from '@/lib/document-constants'
import { uploadTwoPhase } from '../upload-client'
import { UploadProgress } from '../UploadProgress'
import { fileLabel } from './types'

// v0.5.0 (P1-22): диалог загрузки документа — выезд из
// DocumentsSection.tsx (резка под лимит 300, RULES 2.14).
// DF-11: двухфазная загрузка с прогрессом (uploadTwoPhase), лимит —
// настройка files.max_mb, приходит с сервера страницей (D32).
export function DocumentCreateDialog({
  documentsUrl,
  canMarkInternal,
  maxMb = 25,
  onCreated,
}: {
  documentsUrl: string
  canMarkInternal: boolean
  maxMb?: number
  onCreated: () => Promise<void>
}) {
  const { toast } = useToast()
  const maxBytes = maxMb * 1024 * 1024

  const [createOpen, setCreateOpen] = useState(false)
  const [cType, setCType] = useState<DocumentType>('accompanying')
  const [cTitle, setCTitle] = useState('')
  const [cComment, setCComment] = useState('')
  const [cInternal, setCInternal] = useState(false)
  const [cFile, setCFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)

  const resetCreateForm = () => {
    setCTitle('')
    setCComment('')
    setCInternal(false)
    setCFile(null)
    setCType('accompanying')
    setProgress(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const submitCreate = async () => {
    if (!cFile || !cTitle.trim()) return
    if (cFile.size > maxBytes) {
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
        createUrl: documentsUrl,
        createBody: {
          type: cType,
          title: cTitle.trim(),
          comment: cComment.trim() || undefined,
          isInternal: cInternal || undefined,
          fileName: cFile.name,
          mimeType: cFile.type || '',
          size: cFile.size,
        },
        file: cFile,
        onProgress: setProgress,
      })
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
      setProgress(null)
    }
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setCreateOpen(true)}>
        <Plus className="size-4" />
        Загрузить документ
      </Button>

      <Dialog open={createOpen} onOpenChange={(o) => !busy && setCreateOpen(o)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Новый документ</DialogTitle>
            <DialogDescription>
              Файл до {formatDocSize(maxBytes)}: PDF, картинка, DOC/DOCX,
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
{progress !== null && <UploadProgress progress={progress} />}
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
