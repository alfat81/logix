'use client'

import { FileText, FileUp, Lock, SendHorizonal, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import { readApiResponse } from '@/lib/api-client'
import { DOCUMENT_BADGE_VARIANTS } from '@/lib/status-badges'
import { formatDocSize, type DocumentStatus } from '@/lib/document-constants'
import { DocumentLifecycle } from './DocumentLifecycle'
import {
  AUTHOR_ROLE_LABELS,
  fmtDateTime,
  kindLabel,
  statusLabel,
  type DocRowUi,
} from './types'

// DF-13: карточка документа — общий элемент плоского списка
// (DocumentsSection, лида) и слота пакета (реестре документов (DocumentsRegistrySection),
// заявки): бейджи вида/статуса/видимости/версии, снимок финализации,
// история версий со скачиванием, действия — новая версия (замена),
// жизненный цикл (сотрудник) и удаление (менеджер).

export function DocumentCard({
  doc,
  versionsUrlFor,
  deleteUrlFor,
  lifecycleUrlFor,
  submitUrlFor,
  onVersion,
  onDone,
}: {
  doc: DocRowUi
  versionsUrlFor: (docId: string) => string
  /** URL DELETE документа (менеджер); нет пропса — кнопки удаления нет */
  deleteUrlFor?: (docId: string) => string
  /** DF-12: база URL действий жизненного цикла; нет пропса — кнопок нет */
  lifecycleUrlFor?: (docId: string) => string
  /** DF-26: PATCH draft → in_review («отправить на проверку», автор/сотрудник);
   *  нет пропса — кнопки нет (плоский список лидов ведёт себя как раньше). */
  submitUrlFor?: (docId: string) => string
  onVersion: (doc: DocRowUi) => void
  onDone: () => Promise<void>
}) {
  const { toast } = useToast()

  const submitForReview = async () => {
    if (!submitUrlFor) return
    try {
      const res = await fetch(submitUrlFor(doc.id), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'in_review' }),
      })
      const data = await readApiResponse<{ error?: string }>(res)
      if (!res.ok) throw new Error(data.error || 'Не удалось отправить на проверку')
      toast({ title: 'Документ отправлен на проверку', description: doc.title })
      await onDone()
    } catch (e) {
      toast({
        title: 'Не отправлено',
        description: e instanceof Error ? e.message : '',
        variant: 'destructive',
      })
    }
  }

  const submitDelete = async () => {
    if (!deleteUrlFor) return
    if (!window.confirm(`Удалить документ «${doc.title}» со всеми версиями? Действие необратимо.`)) {
      return
    }
    try {
      const res = await fetch(deleteUrlFor(doc.id), { method: 'DELETE' })
      const data = await readApiResponse<{ error?: string }>(res)
      if (!res.ok) throw new Error(data.error || 'Не удалось удалить документ')
      toast({ title: 'Документ удалён', description: doc.title })
      await onDone()
    } catch (e) {
      toast({
        title: 'Документ не удалён',
        description: e instanceof Error ? e.message : '',
        variant: 'destructive',
      })
    }
  }

  return (
    <div className="border rounded-lg p-3 space-y-2">
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
          {/* DF-26: черновик можно отправить на проверку (автор/сотрудник) */}
          {doc.status === 'draft' && submitUrlFor && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void submitForReview()}
              title="Отправить на проверку сотруднику"
            >
              <SendHorizonal className="size-4" />
              На проверку
            </Button>
          )}
          {/* DF-12: версию финального не даём заменить — сначала
              «Вернуть в работу» (правило карточки) */}
          {doc.status !== 'final' && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onVersion(doc)}
              title="Загрузить новую версию (правка)"
            >
              <FileUp className="size-4" />
              Новая версия
            </Button>
          )}
          {lifecycleUrlFor && (
            <DocumentLifecycle doc={doc} urlFor={lifecycleUrlFor} onDone={onDone} />
          )}
          {deleteUrlFor && (
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={() => void submitDelete()}
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
  )
}
