'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { FileText, FileUp, Loader2, Lock, Plus, Trash2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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

// ─── Документооборот (Дорожка Е, роадмап 5): секция документов ─────
// ОДИН компонент на все три контура обмена — админ, клиент, брокер:
// механика загрузки/версий/скачивания едина, различия только в правах
// (флаги canMarkInternal/canDelete) и адресах API (пропсы-функции).
// Подрядчик в контуре Е не участвует — ему секция не отдаётся вовсе.
//
// Данные: списочные проекции без fileData (байты в БД, скачивание —
// только через авторизующий роут /api/document-versions/[id]/file).

export type DocVersionRowUi = {
  id: string
  version: number
  fileName: string
  mimeType: string
  fileSize: number
  comment: string | null
  authorType: 'employee' | 'client' | 'broker' | string
  authorName: string
  createdAt: string
}

export type DocRowUi = {
  id: string
  type: DocumentType | string
  title: string
  isInternal: boolean
  currentVersion: number
  createdAt: string
  updatedAt: string
  versions: DocVersionRowUi[]
}

type DocumentsSectionProps = {
  /** GET списка и POST создания — полный URL */
  documentsUrl: string
  /** URL POST новой версии для конкретного документа */
  versionsUrlFor: (docId: string) => string
  /** URL DELETE документа (менеджер); нет пропса — кнопки удаления нет */
  deleteUrlFor?: (docId: string) => string
  /** Админ: селектор видимости (всем участникам / только сотрудникам) */
  canMarkInternal?: boolean
  title?: string
  emptyText?: string
}

const AUTHOR_ROLE_LABELS: Record<string, string> = {
  employee: 'менеджер',
  client: 'клиент',
  broker: 'брокер',
}

function typeLabel(t: string): string {
  return DOCUMENT_TYPE_LABELS[t as DocumentType] ?? t
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function DocumentsSection({
  documentsUrl,
  versionsUrlFor,
  deleteUrlFor,
  canMarkInternal = false,
  title = 'Документы',
  emptyText = 'Документов пока нет — загрузите первый файл',
}: DocumentsSectionProps) {
  const { toast } = useToast()
  const [docs, setDocs] = useState<DocRowUi[] | null>(null)
  const [loading, setLoading] = useState(true)

  // Диалог создания
  const [createOpen, setCreateOpen] = useState(false)
  const [cType, setCType] = useState<DocumentType>('accompanying')
  const [cTitle, setCTitle] = useState('')
  const [cComment, setCComment] = useState('')
  const [cInternal, setCInternal] = useState(false)
  const [cFile, setCFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)

  // Диалог новой версии
  const [versionDoc, setVersionDoc] = useState<DocRowUi | null>(null)
  const [vComment, setVComment] = useState('')
  const [vFile, setVFile] = useState<File | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const versionFileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(documentsUrl)
      const data = await readApiResponse<{ documents?: DocRowUi[]; error?: string }>(res)
      if (!res.ok) throw new Error(data.error || 'Ошибка загрузки')
      setDocs(data.documents ?? [])
    } catch (e) {
      toast({
        title: 'Не удалось загрузить документы',
        description: e instanceof Error ? e.message : '',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentsUrl])

  useEffect(() => {
    void load()
  }, [load])

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
      await load()
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

  const submitVersion = async () => {
    if (!versionDoc || !vFile) return
    setBusy(true)
    try {
      const fd = new FormData()
      if (vComment.trim()) fd.append('comment', vComment.trim())
      fd.append('file', vFile)
      const res = await fetch(versionsUrlFor(versionDoc.id), { method: 'POST', body: fd })
      const data = await readApiResponse<{ error?: string }>(res)
      if (!res.ok) throw new Error(data.error || 'Не удалось загрузить версию')
      toast({
        title: 'Версия загружена',
        description: `«${versionDoc.title}» — версия ${versionDoc.currentVersion + 1}`,
      })
      setVersionDoc(null)
      setVComment('')
      setVFile(null)
      if (versionFileRef.current) versionFileRef.current.value = ''
      await load()
    } catch (e) {
      toast({
        title: 'Версия не загружена',
        description: e instanceof Error ? e.message : '',
        variant: 'destructive',
      })
    } finally {
      setBusy(false)
    }
  }

  const submitDelete = async (doc: DocRowUi) => {
    if (!deleteUrlFor) return
    if (!window.confirm(`Удалить документ «${doc.title}» со всеми версиями? Действие необратимо.`)) {
      return
    }
    setBusy(true)
    try {
      const res = await fetch(deleteUrlFor(doc.id), { method: 'DELETE' })
      const data = await readApiResponse<{ error?: string }>(res)
      if (!res.ok) throw new Error(data.error || 'Не удалось удалить документ')
      toast({ title: 'Документ удалён', description: doc.title })
      await load()
    } catch (e) {
      toast({
        title: 'Документ не удалён',
        description: e instanceof Error ? e.message : '',
        variant: 'destructive',
      })
    } finally {
      setBusy(false)
    }
  }

  const fileLabel = (f: File | null): string =>
    f ? `${f.name} · ${formatDocSize(f.size)}` : 'Файл не выбран'

  return (
    <Card>
      <CardHeader className="pb-3 flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">
          {title}
          {docs && docs.length > 0 && (
            <span className="ml-2 text-muted-foreground font-normal">{docs.length}</span>
          )}
        </CardTitle>
        <Button size="sm" variant="outline" onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" />
          Загрузить документ
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm py-4 justify-center">
            <Loader2 className="size-4 animate-spin" />
            Загрузка…
          </div>
        ) : !docs || docs.length === 0 ? (
          <p className="text-muted-foreground text-sm py-4 text-center">{emptyText}</p>
        ) : (
          docs.map((doc) => (
            <div key={doc.id} className="border rounded-lg p-3 space-y-2">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap min-w-0">
                  <FileText className="size-4 shrink-0 text-muted-foreground" />
                  <span className="font-medium text-sm truncate">{doc.title}</span>
                  <Badge variant="secondary" className="text-xs">
                    {typeLabel(doc.type)}
                  </Badge>
                  {doc.isInternal && (
                    <Badge variant="outline" className="text-xs gap-1">
                      <Lock className="size-3" />
                      Внутренний
                    </Badge>
                  )}
                  {/* Версионность (§2.2/§3.2): тег версии — «таблетка» V x.y */}
                  <Badge variant="version" className="text-xs">
                    v{doc.currentVersion}
                  </Badge>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setVersionDoc(doc)
                      setVComment('')
                      setVFile(null)
                    }}
                    title="Загрузить новую версию (правка)"
                  >
                    <FileUp className="size-4" />
                    Новая версия
                  </Button>
                  {deleteUrlFor && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => void submitDelete(doc)}
                      disabled={busy}
                      title="Удалить документ целиком (только менеджер)"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </div>
              </div>

              {/* История версий: свежая сверху; скачивание — прямой
                  ссылкой, куки уходят с запросом сами */}
              <div className="space-y-1.5">
                {doc.versions.map((v) => (
                  <div
                    key={v.id}
                    className="flex items-start justify-between gap-3 flex-wrap text-xs text-muted-foreground pl-1"
                  >
                    <div className="min-w-0">
                      <span className="font-medium text-foreground">v{v.version}</span>{' '}
                      · {fmtDateTime(v.createdAt)} · {v.authorName} (
                      {AUTHOR_ROLE_LABELS[v.authorType] ?? v.authorType})
                      {v.comment && <span className="block italic">{v.comment}</span>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span>{formatDocSize(v.fileSize)}</span>
                      <a
                        href={`/api/document-versions/${v.id}/file`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline underline-offset-2 hover:text-foreground"
                        title={v.fileName}
                      >
                        {v.fileName}
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </CardContent>

      {/* ── Диалог: загрузка документа ─────────────────────────── */}
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

      {/* ── Диалог: новая версия ───────────────────────────────── */}
      <Dialog open={versionDoc !== null} onOpenChange={(o) => !o && setVersionDoc(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Новая версия документа</DialogTitle>
            <DialogDescription>
              «{versionDoc?.title}» — текущая версия v{versionDoc?.currentVersion}. Правки
              видят все участники сделки в истории версий.
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
          </div>
          <DialogFooter>
            <Button
              onClick={() => void submitVersion()}
              disabled={busy || !vFile}
            >
              {busy && <Loader2 className="size-4 animate-spin" />}
              Загрузить версию
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
