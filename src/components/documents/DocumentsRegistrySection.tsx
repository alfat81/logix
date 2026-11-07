'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2, Plus } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import { readApiResponse } from '@/lib/api-client'
import { downloadZipArchive, type ZipDownloadInit } from '@/lib/document-zip-client'
import type { DocumentKind } from '@/lib/document-constants'
import type { RegistryStageOption } from './parts/RegistryDocRow'
import { RegistryHeader } from './parts/RegistryHeader'
import { RegistryPhaseGroup, type PermitFileUi } from './parts/RegistryPhaseGroup'
import { RegistryDialogs, type RegistryCreateTarget } from './parts/RegistryDialogs'
import { buildPhaseGroups, phaseHeaderCount } from './parts/registry-groups'
import type { DocRowUi } from './parts/types'
import type { PackageFallbackUi } from './parts/PackageZipFallbackDialog'
import type { PermitLiteUi, RegistryData, RegistryFilter } from './parts/registry-types'
import { PermitCreateDialog } from '@/components/permits/PermitDialogs'

// ─── DF-26 §3.3: единый реестр документов заявки по фазам ───────────
// Основная область «Документов» (замещает слотовый экран DF-13 и
// PermitsSection на заявке; на лидах PermitsSection остаётся, О8).
// Фазы — производная вида; строки требований — по stagePhase (§3.3.3);
// ZIP — GET финальные / POST all·selected (§8); «Принять/Отклонить» —
// волна 2 (Р-2); загрузка по требованию — §3.3.6.

export type DocumentsRegistrySectionProps = {
  packageUrl: string
  zipUrl: string
  documentsUrl: string
  versionsUrlFor: (docId: string) => string
  deleteUrlFor?: (docId: string) => string
  lifecycleUrlFor?: (docId: string) => string
  submitUrlFor?: (docId: string) => string
  stagePatchUrlFor?: (docId: string) => string
  stages?: RegistryStageOption[]
  transportType?: string | null
  canMarkInternal?: boolean
  /** POST добавления строки разрешительных (staff/брокер) — фаза 07 */
  permitsCreateUrl?: string
  /** PATCH строки разрешительных (staff) — «Править»/«Не требуется» */
  permitsPatchUrlFor?: (permitId: string) => string
  /** VIEWER строк разрешительных (заметка — только staff) */
  permitViewer?: 'staff' | 'broker'
  /** Кнопка «К заявке» (режим основной области на странице заявки) */
  onBack?: () => void
  onChanged?: () => void
}

export function DocumentsRegistrySection({
  packageUrl,
  zipUrl,
  documentsUrl,
  versionsUrlFor,
  deleteUrlFor,
  lifecycleUrlFor,
  submitUrlFor,
  stagePatchUrlFor,
  stages,
  transportType,
  canMarkInternal = false,
  permitsCreateUrl,
  permitsPatchUrlFor,
  permitViewer = 'staff',
  onBack,
  onChanged,
}: DocumentsRegistrySectionProps) {
  const { toast } = useToast()
  const [data, setData] = useState<(RegistryData & { permits?: PermitLiteUi[] }) | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<RegistryFilter>('all')
  const [openPhases, setOpenPhases] = useState<Set<string>>(new Set())
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [createTarget, setCreateTarget] = useState<RegistryCreateTarget | null>(null)
  const [versionDoc, setVersionDoc] = useState<DocRowUi | null>(null)
  const [zipConfirm, setZipConfirm] = useState<{ scope: 'all' | 'selected'; total: number } | null>(null)
  const [zipBusy, setZipBusy] = useState(false)
  const [zipFallback, setZipFallback] = useState<PackageFallbackUi | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(packageUrl)
      const json = await readApiResponse<RegistryData & { error?: string; permits?: PermitLiteUi[] }>(res)
      if (!res.ok) throw new Error(json.error || 'Ошибка загрузки')
      setData(json)
      setError(null)
      const cp = json.summary?.currentStagePhase
      if (cp) setOpenPhases((prev) => (prev.size === 0 ? new Set([cp as string]) : prev))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки')
    } finally {
      setLoading(false)
    }
  }, [packageUrl])

  useEffect(() => {
    void load()
  }, [load])

  const refresh = useCallback(async () => {
    await load()
    onChanged?.()
  }, [load, onChanged])

  // Разрезка по фазам: документы, строки-ожидания и требования (§3.3).
  const groups = useMemo(
    () => (data ? buildPhaseGroups({ slots: data.slots, permits: data.permits ?? [] }, filter, transportType) : []),
    [data, filter, transportType],
  )

  const summary = data?.summary ?? null
  const nonfinalCount = (summary?.nonFinalDrafts ?? 0) + (summary?.nonFinalReview ?? 0)
  // Счётчик фильтра «Разрешительные» — строки разрешительных по
  // состояниям позиций (§3.4): ожидаются + на проверке.
  const permitsCounter = (summary?.permitsPending ?? 0) + (summary?.permitsSubmitted ?? 0)
  const totalDocs = data?.slots.reduce((n, s) => n + s.documents.length, 0) ?? 0

  // Файл, закрывающий требование, — внутри строки требования (§3.3.3).
  const docById = useMemo(() => {
    const map = new Map<string, DocRowUi>()
    for (const s of data?.slots ?? []) for (const d of s.documents) map.set(d.id, d)
    return map
  }, [data])
  // DF-26 волна 2 (§5.4): «Принять/Отклонить» — URL из базы PATCH-роута;
  // метка «требует привязки» — bindingState отдаётся только сотрудникам.
  const permitActionUrlFor = permitsPatchUrlFor
    ? (permitId: string, action: 'accept' | 'reject') => `${permitsPatchUrlFor(permitId)}/${action}`
    : undefined
  const permitBindingStateFor = useCallback(
    (permitId: string) => (data?.permits ?? []).find((p) => p.id === permitId)?.bindingState,
    [data],
  )

  const permitFileFor = useCallback(
    (permit: PermitLiteUi): PermitFileUi | null => {
      if (!permit.documentId) return null
      const doc = docById.get(permit.documentId)
      if (!doc) return null
      return {
        fileName: doc.versions[0]?.fileName ?? doc.title,
        currentVersion: doc.currentVersion,
        // История версий и «Новая версия» — один диалог (версии одного
        // документа; авто-возврат требования — волна 2).
        onOpen: () => setVersionDoc(doc),
        onNewVersion: () => setVersionDoc(doc),
      }
    },
    [docById],
  )

  const downloadZip = async (init?: ZipDownloadInit) => {
    setZipBusy(true)
    try {
      const { fallback } = await downloadZipArchive(zipUrl, init)
      if (fallback) setZipFallback(fallback)
      else toast({ title: 'Архив скачан' })
    } catch (e) {
      toast({ title: 'Архив не собран', description: e instanceof Error ? e.message : '', variant: 'destructive' })
    } finally {
      setZipBusy(false)
      setZipConfirm(null)
    }
  }

  return (
    <Card>
      <RegistryHeader
        orderNumber={data?.orderNumber ?? null}
        summary={summary}
        filter={filter}
        onFilter={setFilter}
        nonfinalCount={nonfinalCount}
        permitsCounter={permitsCounter}
        selectMode={selectMode}
        selectedCount={selected.size}
        onToggleSelect={() => {
          setSelectMode((v) => !v)
          setSelected(new Set())
        }}
        onDownloadSelected={() => setZipConfirm({ scope: 'selected', total: selected.size })}
        onDownloadFinal={() => void downloadZip()}
        onDownloadAll={() => setZipConfirm({ scope: 'all', total: totalDocs })}
        zipBusy={zipBusy}
        onBack={onBack}
      />
      <CardContent className="space-y-3">
        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm py-6 justify-center">
            <Loader2 className="size-4 animate-spin" />
            Загрузка…
          </div>
        ) : error || !data ? (
          <p className="text-muted-foreground text-sm py-6 text-center">{error ?? 'Реестр недоступен'}</p>
        ) : (
          groups.map(({ phase, docs, emptySlots, permits }) => (
            <RegistryPhaseGroup
              key={phase}
              phase={phase}
              docs={docs}
              emptySlots={emptySlots}
              permits={permits}
              checks={phase === 'permits' ? data.checks : undefined}
              permitFileFor={permitFileFor}
              open={openPhases.has(phase) || filter !== 'all'}
              highlight={phase === summary?.currentStagePhase && filter === 'all'}
              headerCount={phaseHeaderCount(phase, docs, emptySlots, permits, summary)}
              transportType={transportType}
              selectMode={selectMode}
              selected={selected}
              onToggleDoc={(id, checked) =>
                setSelected((prev) => {
                  const next = new Set(prev)
                  if (checked) next.add(id)
                  else next.delete(id)
                  return next
                })
              }
              onToggleOpen={(p) =>
                setOpenPhases((prev) => {
                  const next = new Set(prev)
                  if (next.has(p)) next.delete(p)
                  else next.add(p)
                  return next
                })
              }
              onSlotUpload={(slot) =>
                setCreateTarget({ kind: slot.kind as DocumentKind, stageCode: slot.requiredFor?.[0]?.stageCode ?? null })
              }
              onPermitUpload={(permit) =>
                setCreateTarget({ kind: 'permit_document', stageCode: null, permitRequirementId: permit.id, permitTitle: permit.title })
              }
              permitsPatchUrlFor={permitsPatchUrlFor}
              permitActionUrlFor={permitActionUrlFor}
              warnDays={data.warnDaysBefore}
              permitBindingStateFor={permitBindingStateFor}
              onPermitSaved={refresh}
              headerActions={
                phase === 'permits' && permitsCreateUrl ? (
                  <PermitCreateDialog
                    createUrl={permitsCreateUrl}
                    viewer={permitViewer}
                    onCreated={refresh}
                  />
                ) : undefined
              }
              versionsUrlFor={versionsUrlFor}
              deleteUrlFor={deleteUrlFor}
              lifecycleUrlFor={lifecycleUrlFor}
              submitUrlFor={submitUrlFor}
              stagePatchUrlFor={stagePatchUrlFor}
              stages={stages ?? []}
              onVersion={setVersionDoc}
              onDone={refresh}
            />
          ))
        )}
      </CardContent>

      {/* Мобильная липкая кнопка (§3.6): полноэкранный реестр 375 px */}
      <div className="sticky bottom-0 p-3 bg-card border-t md:hidden">
        <Button className="w-full h-11" onClick={() => setCreateTarget({ kind: null, stageCode: null })}>
          <Plus className="size-4" />
          Добавить документ
        </Button>
      </div>

      <RegistryDialogs
        documentsUrl={documentsUrl}
        canMarkInternal={canMarkInternal}
        maxMb={data?.maxMb ?? 25}
        createTarget={createTarget}
        onCloseCreate={() => setCreateTarget(null)}
        versionDoc={versionDoc}
        versionsUrlFor={versionsUrlFor}
        onCloseVersion={() => setVersionDoc(null)}
        onDone={refresh}
        zipFallback={zipFallback}
        onCloseFallback={() => setZipFallback(null)}
        zipConfirmScope={zipConfirm?.scope ?? null}
        zipTotal={zipConfirm?.total ?? 0}
        zipDrafts={summary?.nonFinalDrafts ?? 0}
        zipReview={summary?.nonFinalReview ?? 0}
        zipBusy={zipBusy}
        onConfirmZip={() =>
          zipConfirm &&
          void downloadZip(
            zipConfirm.scope === 'selected'
              ? { scope: 'selected', documentIds: [...selected] }
              : { scope: 'all' },
          )
        }
        onCancelZip={() => setZipConfirm(null)}
      />
    </Card>
  )
}
