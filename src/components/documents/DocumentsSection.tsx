'use client'

import { useCallback, useEffect, useState } from 'react'
import { FileText, FileUp, Loader2, Lock, Trash2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import { readApiResponse } from '@/lib/api-client'
import { DOCUMENT_BADGE_VARIANTS } from '@/lib/status-badges'
import { formatDocSize, type DocumentStatus } from '@/lib/document-constants'
import { DocumentCreateDialog } from './parts/DocumentCreateDialog'
import { DocumentLifecycle } from './parts/DocumentLifecycle'
import { DocumentVersionDialog } from './parts/DocumentVersionDialog'
import {
  AUTHOR_ROLE_LABELS,
  fmtDateTime,
  kindLabel,
  statusLabel,
  type DocRowUi,
} from './parts/types'

// ─── Документооборот (Дорожка Е, роадмап 5): секция документов ─────
// ОДИН компонент на все три контура обмена — админ, клиент, брокер:
// механика загрузки/версий/скачивания едина, различия только в правах
// (флаги canMarkInternal/canDelete) и адресах API (пропсы-функции).
// Подрядчик в контуре Е не участвует — ему секция не отдаётся вовсе.
//
// Данные: списочные проекции без fileData (байты в БД, скачивание —
// только через авторизующий роут /api/document-versions/[id]/file).
//
// v0.5.0 (P1-22): диалоги загрузки и версии — выезд в parts/
// (резка под лимит 300, RULES 2.14).

export type { DocRowUi, DocVersionRowUi } from './parts/types'

type DocumentsSectionProps = {
  /** GET списка и POST создания — полный URL */
  documentsUrl: string
  /** URL POST новой версии для конкретного документа */
  versionsUrlFor: (docId: string) => string
  /** URL DELETE документа (менеджер); нет пропса — кнопки удаления нет */
  deleteUrlFor?: (docId: string) => string
  /** Админ: селектор видимости (всем участникам / только сотрудникам) */
  canMarkInternal?: boolean
  /** DF-12: база URL действий жизненного цикла; нет пропса — кнопок
   *  «Финальный»/«Вернуть в работу» нет (кабинеты клиента и брокера) */
  lifecycleUrlFor?: (docId: string) => string
  title?: string
  emptyText?: string
}

export function DocumentsSection({
  documentsUrl,
  versionsUrlFor,
  deleteUrlFor,
  canMarkInternal = false,
  lifecycleUrlFor,
  title = 'Документы',
  emptyText = 'Документов пока нет — загрузите первый файл',
}: DocumentsSectionProps) {
  const { toast } = useToast()
  const [docs, setDocs] = useState<DocRowUi[] | null>(null)
  const [loading, setLoading] = useState(true)
  // DF-11: лимит загрузки — настройка files.max_mb; приходит в GET списка
  // (сервер читает настройку с кэшем 60 с) — подсказка и предпроверка в UI.
  const [maxMb, setMaxMb] = useState(25)

  // Диалог новой версии (форма живёт в диалоге)
  const [versionDoc, setVersionDoc] = useState<DocRowUi | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(documentsUrl)
      const data = await readApiResponse<{ documents?: DocRowUi[]; maxMb?: number; error?: string }>(res)
      if (!res.ok) throw new Error(data.error || 'Ошибка загрузки')
      setDocs(data.documents ?? [])
      if (typeof data.maxMb === 'number' && data.maxMb > 0) setMaxMb(data.maxMb)
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

  const submitDelete = async (doc: DocRowUi) => {
    if (!deleteUrlFor) return
    if (!window.confirm(`Удалить документ «${doc.title}» со всеми версиями? Действие необратимо.`)) {
      return
    }
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
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3 flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">
          {title}
          {docs && docs.length > 0 && (
            <span className="ml-2 text-muted-foreground font-normal">{docs.length}</span>
          )}
        </CardTitle>
        <DocumentCreateDialog
          documentsUrl={documentsUrl}
          canMarkInternal={canMarkInternal}
          maxMb={maxMb}
          onCreated={load}
        />
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
                    {kindLabel(doc)}
                  </Badge>
                  {/* DF-12: жизненный цикл — «ФИНАЛЬНЫЙ» с замком (§3.2) */}
                  <Badge
                    variant={DOCUMENT_BADGE_VARIANTS[doc.status as DocumentStatus] ?? 'version'}
                    className="text-xs gap-1"
                  >
                    {doc.status === 'final' && <Lock className="size-3" />}
                    {statusLabel(doc.status)}
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
                  {/* DF-12: версию финального не даём заменить — сначала
                      «Вернуть в работу» (правило карточки) */}
                  {doc.status !== 'final' && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setVersionDoc(doc)}
                      title="Загрузить новую версию (правка)"
                    >
                      <FileUp className="size-4" />
                      Новая версия
                    </Button>
                  )}
                  {lifecycleUrlFor && (
                    <DocumentLifecycle doc={doc} urlFor={lifecycleUrlFor} onDone={load} />
                  )}
                  {deleteUrlFor && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => void submitDelete(doc)}
                      title="Удалить документ целиком (только менеджер)"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </div>
              </div>

              {/* DF-12: снимок финализации — кто и какую версию объявил финальной */}
              {doc.status === 'final' && doc.finalizedAt && (
                <p className="text-xs text-muted-foreground pl-1">
                  Финальная версия v{doc.finalVersion ?? doc.currentVersion} · {doc.finalizedByName} ·{' '}
                  {fmtDateTime(doc.finalizedAt)}
                </p>
              )}

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

      <DocumentVersionDialog
        doc={versionDoc}
        versionsUrlFor={versionsUrlFor}
        maxMb={maxMb}
        onClose={() => setVersionDoc(null)}
        onDone={load}
      />
    </Card>
  )
}
