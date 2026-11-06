'use client'

import { ChevronDown, ChevronRight } from 'lucide-react'
import {
  DOCUMENT_PHASE_META,
  suggestedTransportVariant,
  type DocumentPhase,
} from '@/lib/document-phases'
import { RegistryDocRow, type RegistryStageOption } from './RegistryDocRow'
import { RegistryPermitRow } from './RegistryPermitRow'
import { RegistrySlotRow } from './RegistrySlotRow'
import type { DocRowUi } from './types'
import type { PermitLiteUi, SlotRowUi } from './registry-types'

// ─── DF-26 §3.3: одна фаза реестра — аккордеон с заголовком, строки
// документов, строки-ожидания и строки разрешительных требований
// (§3.3.3, T21-03). Вынесено из DocumentsRegistrySection
// (RULES 2.14: файл ≤ 300 строк).

/** Файл, закрывающий требование, — проекция для строки требования. */
export type PermitFileUi = {
  fileName: string
  currentVersion: number
  onOpen: () => void
  onNewVersion: () => void
}

export type RegistryPhaseGroupProps = {
  phase: DocumentPhase
  docs: DocRowUi[]
  emptySlots: SlotRowUi[]
  permits: PermitLiteUi[]
  /** Файл требования (documentId) — показывается внутри строки. */
  permitFileFor: (permit: PermitLiteUi) => PermitFileUi | null
  open: boolean
  /** Фаза текущего этапа заявки и фильтр «все» — рамка-выделение */
  highlight: boolean
  /** Сводка в заголовке фазы (фаза 07 — счётчики разрешительных §3.4). */
  headerCount: string
  transportType?: string | null
  selectMode: boolean
  selected: Set<string>
  onToggleDoc: (id: string, checked: boolean) => void
  onToggleOpen: (phase: DocumentPhase) => void
  onSlotUpload: (slot: SlotRowUi) => void
  onPermitUpload: (permit: PermitLiteUi) => void
  /** PATCH строки (сотрудник); нет — «Править» не показывается */
  permitsPatchUrlFor?: (permitId: string) => string
  onPermitSaved: () => Promise<void>
  /** Триггер «Добавить требование» (staff/брокер) — вне кнопки аккордеона */
  headerActions?: React.ReactNode
  versionsUrlFor: (docId: string) => string
  deleteUrlFor?: (docId: string) => string
  lifecycleUrlFor?: (docId: string) => string
  submitUrlFor?: (docId: string) => string
  stagePatchUrlFor?: (docId: string) => string
  stages: RegistryStageOption[]
  onVersion: (doc: DocRowUi) => void
  onDone: () => Promise<void>
}

export function RegistryPhaseGroup({
  phase,
  docs,
  emptySlots,
  permits,
  permitFileFor,
  open,
  highlight,
  headerCount,
  transportType,
  selectMode,
  selected,
  onToggleDoc,
  onToggleOpen,
  onSlotUpload,
  onPermitUpload,
  permitsPatchUrlFor,
  onPermitSaved,
  headerActions,
  versionsUrlFor,
  deleteUrlFor,
  lifecycleUrlFor,
  submitUrlFor,
  stagePatchUrlFor,
  stages,
  onVersion,
  onDone,
}: RegistryPhaseGroupProps) {
  return (
    <div className={highlight ? 'border-2 rounded-lg p-2' : ''}>
      <div className="flex items-center gap-2 px-1 py-1.5">
        <button
          type="button"
          className="flex flex-1 items-center gap-2 text-left min-w-0"
          onClick={() => onToggleOpen(phase)}
          aria-expanded={open}
        >
          {open ? <ChevronDown className="size-4 shrink-0" /> : <ChevronRight className="size-4 shrink-0" />}
          <span className="text-sm font-semibold">{DOCUMENT_PHASE_META[phase].label}</span>
          <span className="ml-auto text-xs text-muted-foreground">{headerCount}</span>
        </button>
        {headerActions}
      </div>
      {open && (
        <div className="space-y-2 pl-6 pt-1">
          {docs.map((doc) => (
            <RegistryDocRow
              key={doc.id}
              doc={doc}
              selectable={selectMode}
              selected={selected.has(doc.id)}
              onToggle={onToggleDoc}
              versionsUrlFor={versionsUrlFor}
              deleteUrlFor={deleteUrlFor}
              lifecycleUrlFor={lifecycleUrlFor}
              submitUrlFor={submitUrlFor}
              stagePatchUrlFor={stagePatchUrlFor}
              stages={stages}
              onVersion={onVersion}
              onDone={onDone}
            />
          ))}
          {emptySlots.map((slot) => (
            <RegistrySlotRow
              key={slot.kind}
              slot={slot}
              suggested={suggestedTransportVariant(transportType)}
              onUpload={() => onSlotUpload(slot)}
            />
          ))}
          {permits.map((permit) => (
            <RegistryPermitRow
              key={permit.id}
              permit={permit}
              file={permitFileFor(permit)}
              patchUrlFor={permitsPatchUrlFor}
              onSaved={onPermitSaved}
              onUpload={() => onPermitUpload(permit)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
