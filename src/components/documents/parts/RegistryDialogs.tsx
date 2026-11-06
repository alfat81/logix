'use client'

import { DocumentCreateDialog } from './DocumentCreateDialog'
import { DocumentVersionDialog } from './DocumentVersionDialog'
import { PackageZipFallbackDialog, type PackageFallbackUi } from './PackageZipFallbackDialog'
import { ZipScopeConfirmDialog } from './ZipScopeConfirmDialog'
import type { RegistryStageOption } from './RegistryDocRow'
import type { DocRowUi } from './types'
import type { DocumentKind } from '@/lib/document-constants'

// ─── DF-26 §3.3: диалоговый хвост реестра — выезд из
// DocumentsRegistrySection (RULES 2.14: файл ≤ 300 строк, T21-02/03).
// Единая форма «Новый документ» (в т.ч. по разрешительному требованию),
// «Новая версия», ZIP-фолбэк и подтверждение «скачать всё».

/** Цель открытия единой формы: слот, требование или липкая кнопка. */
export type RegistryCreateTarget = {
  kind: DocumentKind | null
  stageCode: string | null
  permitRequirementId?: string
  permitTitle?: string
}

export function RegistryDialogs({
  documentsUrl,
  canMarkInternal,
  maxMb,
  createTarget,
  onCloseCreate,
  versionDoc,
  versionsUrlFor,
  onCloseVersion,
  onDone,
  zipFallback,
  onCloseFallback,
  zipConfirmScope,
  zipTotal,
  zipDrafts,
  zipReview,
  zipBusy,
  onConfirmZip,
  onCancelZip,
}: {
  documentsUrl: string
  canMarkInternal: boolean
  maxMb: number
  createTarget: RegistryCreateTarget | null
  onCloseCreate: () => void
  versionDoc: DocRowUi | null
  versionsUrlFor: (docId: string) => string
  onCloseVersion: () => void
  onDone: () => Promise<void>
  zipFallback: PackageFallbackUi | null
  onCloseFallback: () => void
  zipConfirmScope: 'all' | 'selected' | null
  zipTotal: number
  zipDrafts: number
  zipReview: number
  zipBusy: boolean
  onConfirmZip: () => void
  onCancelZip: () => void
}) {
  return (
    <>
      <DocumentCreateDialog
        documentsUrl={documentsUrl}
        canMarkInternal={canMarkInternal}
        maxMb={maxMb}
        onCreated={onDone}
        open={createTarget !== null}
        onOpenChange={(o) => {
          if (!o) onCloseCreate()
        }}
        presetKind={createTarget?.kind ?? null}
        presetStageCode={createTarget?.stageCode ?? null}
        presetPermitRequirementId={createTarget?.permitRequirementId ?? null}
        presetPermitTitle={createTarget?.permitTitle ?? null}
      />
      <DocumentVersionDialog
        doc={versionDoc}
        versionsUrlFor={versionsUrlFor}
        maxMb={maxMb}
        onClose={onCloseVersion}
        onDone={onDone}
      />
      <PackageZipFallbackDialog data={zipFallback} onClose={onCloseFallback} />
      <ZipScopeConfirmDialog
        open={zipConfirmScope !== null}
        scope={zipConfirmScope ?? 'all'}
        total={zipTotal}
        drafts={zipDrafts}
        review={zipReview}
        busy={zipBusy}
        onConfirm={onConfirmZip}
        onCancel={onCancelZip}
      />
    </>
  )
}
