'use client'

import { useCallback, useEffect, useState } from 'react'
import { Archive, Loader2, Lock, Plus } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import { readApiResponse } from '@/lib/api-client'
import {
  DOCUMENT_BADGE_VARIANTS,
  type StatusBadgeVariant,
} from '@/lib/status-badges'
import {
  DOCUMENT_KIND_GROUPS,
  DOCUMENT_KIND_LABELS,
  DOC_PROVIDER_LABELS,
  type DocumentKind,
  type DocumentStatus,
  type DocProvider,
} from '@/lib/document-constants'
import { DocumentCreateDialog } from './parts/DocumentCreateDialog'
import { DocumentCard } from './parts/DocumentCard'
import { DocumentVersionDialog } from './parts/DocumentVersionDialog'
import {
  PackageZipFallbackDialog,
  type PackageFallbackUi,
} from './parts/PackageZipFallbackDialog'
import { slotStatusLabel, type DocRowUi, type PackageSlotUi } from './parts/types'

// ─── DF-13: пакет документов заявки — слоты вместо плоского списка ──
// ОДИН компонент на три кабинета (как DocumentsSection): строки по
// видам документов (D5) × статус «нет/черновик/на проверке/финальный»,
// подсказка «кто предоставляет», ссылки на версии, кнопка загрузки в
// слот и «Скачать финальные документы» (ZIP или фолбэк списком ссылок).
// Для лидов остаётся плоский DocumentsSection — пакет living только
// на заявках (роуты /api/{admin|client|broker}/orders/[id]/package).

type DocumentsPackageSectionProps = {
  /** GET слотов пакета */
  packageUrl: string
  /** GET ZIP финальных (или JSON-фолбэка) */
  zipUrl: string
  /** POST создания документа (тот же, что у DocumentsSection) */
  documentsUrl: string
  versionsUrlFor: (docId: string) => string
  deleteUrlFor?: (docId: string) => string
  lifecycleUrlFor?: (docId: string) => string
  canMarkInternal?: boolean
  title?: string
}

// «Нет» — нейтральный outline, остальные статусы — вариант документа.
const SLOT_BADGE_VARIANTS: Record<string, StatusBadgeVariant | 'outline'> = {
  none: 'outline',
  draft: DOCUMENT_BADGE_VARIANTS.draft,
  in_review: DOCUMENT_BADGE_VARIANTS.in_review,
  final: DOCUMENT_BADGE_VARIANTS.final,
}

export function DocumentsPackageSection({
  packageUrl,
  zipUrl,
  documentsUrl,
  versionsUrlFor,
  deleteUrlFor,
  lifecycleUrlFor,
  canMarkInternal = false,
  title = 'Документы',
}: DocumentsPackageSectionProps) {
  const { toast } = useToast()
  const [slots, setSlots] = useState<PackageSlotUi[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [maxMb, setMaxMb] = useState(25)
  const [finalCount, setFinalCount] = useState(0)
  const [slotKind, setSlotKind] = useState<DocumentKind | null>(null)
  const [versionDoc, setVersionDoc] = useState<DocRowUi | null>(null)
  const [zipBusy, setZipBusy] = useState(false)
  const [zipFallback, setZipFallback] = useState<PackageFallbackUi | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(packageUrl)
      const data = await readApiResponse<{
        slots?: PackageSlotUi[]
        maxMb?: number
        error?: string
      }>(res)
      if (!res.ok) throw new Error(data.error || 'Ошибка загрузки')
      const list = data.slots ?? []
      setSlots(list)
      if (typeof data.maxMb === 'number' && data.maxMb > 0) setMaxMb(data.maxMb)
      setFinalCount(
        list.reduce((n, s) => n + s.documents.filter((d) => d.status === 'final').length, 0),
      )
    } catch (e) {
      toast({
        title: 'Не удалось загрузить пакет документов',
        description: e instanceof Error ? e.message : '',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [packageUrl])

  useEffect(() => {
    void load()
  }, [load])

  const downloadZip = async () => {
    setZipBusy(true)
    try {
      const res = await fetch(zipUrl)
      const contentType = res.headers.get('content-type') ?? ''
      if (!res.ok) {
        const data = await readApiResponse<{ error?: string }>(res)
        throw new Error(data.error || 'Не удалось собрать архив')
      }
      if (contentType.includes('application/json')) {
        // Порог размера: сервер отдал список ссылок вместо архива.
        const data = (await res.json()) as PackageFallbackUi
        setZipFallback(data)
        return
      }
      const blob = await res.blob()
      const disposition = res.headers.get('content-disposition') ?? ''
      const match = disposition.match(/filename="?([^";]+)"?/i)
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = match ? match[1] : 'documents.zip'
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(a.href)
      toast({
        title: 'Пакет финальных документов скачан',
        description: `${finalCount} документ(ов) в архиве`,
      })
    } catch (e) {
      toast({
        title: 'Архив не собран',
        description: e instanceof Error ? e.message : '',
        variant: 'destructive',
      })
    } finally {
      setZipBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3 flex-row items-center justify-between space-y-0 gap-2 flex-wrap">
        <CardTitle className="text-base">
          {title}
          {slots && (
            <span className="ml-2 text-muted-foreground font-normal">
              {slots.reduce((n, s) => n + s.documents.length, 0)}
            </span>
          )}
        </CardTitle>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => void downloadZip()}
            disabled={zipBusy || finalCount === 0}
            title={
              finalCount === 0
                ? 'Финальных документов нет — объявите документ финальным'
                : 'Скачать финальные документы одним архивом'
            }
          >
            {zipBusy ? <Loader2 className="size-4 animate-spin" /> : <Archive className="size-4" />}
            Скачать финальные
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm py-4 justify-center">
            <Loader2 className="size-4 animate-spin" />
            Загрузка…
          </div>
        ) : !slots ? (
          <p className="text-muted-foreground text-sm py-4 text-center">
            Пакет недоступен — обновите страницу
          </p>
        ) : (
          /* Слоты рендерятся всегда: «Нет» — полноценная строка с
             подсказкой поставщика и кнопкой загрузки (чек-лист пакета). */
          DOCUMENT_KIND_GROUPS.map((group) => {
            const groupSlots = slots.filter((s) => (group.kinds as readonly string[]).includes(s.kind as string))
            if (groupSlots.length === 0) return null
            return (
              <div key={group.code} className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {group.label}
                </p>
                {groupSlots.map((slot) => (
                  <div key={slot.kind as string} className="border rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap min-w-0">
                        <span className="font-medium text-sm">
                          {DOCUMENT_KIND_LABELS[slot.kind as DocumentKind] ?? slot.kind}
                        </span>
                        <Badge
                          variant={SLOT_BADGE_VARIANTS[slot.status as string] ?? 'outline'}
                          className="text-xs gap-1"
                        >
                          {slot.status === 'final' && <Lock className="size-3" />}
                          {slotStatusLabel(slot.status as string)}
                        </Badge>
                        {slot.provider && (
                          <span className="text-xs text-muted-foreground">
                            предоставляет:{' '}
                            {DOC_PROVIDER_LABELS[slot.provider as DocProvider]}
                          </span>
                        )}
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setSlotKind(slot.kind as DocumentKind)}
                        title={`Загрузить документ вида «${DOCUMENT_KIND_LABELS[slot.kind as DocumentKind] ?? slot.kind}»`}
                      >
                        <Plus className="size-4" />
                        Загрузить
                      </Button>
                    </div>
                    {slot.documents.length > 0 && (
                      <div className="space-y-2">
                        {slot.documents.map((doc) => (
                          <DocumentCard
                            key={doc.id}
                            doc={doc}
                            versionsUrlFor={versionsUrlFor}
                            deleteUrlFor={deleteUrlFor}
                            lifecycleUrlFor={lifecycleUrlFor}
                            onVersion={setVersionDoc}
                            onDone={load}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )
          })
        )}
      </CardContent>

      <DocumentCreateDialog
        documentsUrl={documentsUrl}
        canMarkInternal={canMarkInternal}
        maxMb={maxMb}
        onCreated={load}
        open={slotKind !== null}
        onOpenChange={(o) => {
          if (!o) setSlotKind(null)
        }}
        presetKind={slotKind}
      />
      <DocumentVersionDialog
        doc={versionDoc}
        versionsUrlFor={versionsUrlFor}
        maxMb={maxMb}
        onClose={() => setVersionDoc(null)}
        onDone={load}
      />
      <PackageZipFallbackDialog data={zipFallback} onClose={() => setZipFallback(null)} />
    </Card>
  )
}
