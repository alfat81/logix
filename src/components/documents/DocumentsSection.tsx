'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'
import { readApiResponse } from '@/lib/api-client'
import { DocumentCreateDialog } from './parts/DocumentCreateDialog'
import { DocumentCard } from './parts/DocumentCard'
import { DocumentVersionDialog } from './parts/DocumentVersionDialog'
import type { DocRowUi } from './parts/types'

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
// (резка под лимит 300, RULES 2.14). DF-13: карточка документа —
// общий part с пакетной секцией заявки (parts/DocumentCard.tsx).

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
            <DocumentCard
              key={doc.id}
              doc={doc}
              versionsUrlFor={versionsUrlFor}
              deleteUrlFor={deleteUrlFor}
              lifecycleUrlFor={lifecycleUrlFor}
              onVersion={setVersionDoc}
              onDone={load}
            />
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
