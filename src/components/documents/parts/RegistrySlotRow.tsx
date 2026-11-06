'use client'

import { Plus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DOCUMENT_KIND_LABELS,
  DOC_PROVIDER_LABELS,
  type DocumentKind,
  type DocProvider,
} from '@/lib/document-constants'
import { isTransportKind, LOGICAL_DOC_TYPE_LABELS } from '@/lib/document-phases'
import { slotStatusLabel } from './types'
import type { SlotRowUi } from './registry-types'

// ─── DF-26 §3.3.2: строка-ожидание (слот реестра без документа) ─────
// Приглушённая строка «ожидается от …» с одной кнопкой загрузки;
// бейджи требований этапов переносятся из слота без изменений (DF-14).
// Логический слот «Транспортная накладная» показывает подсказку
// варианта по типу перевозки (§4.3.3).

export function RegistrySlotRow({
  slot,
  suggested,
  onUpload,
}: {
  slot: SlotRowUi
  suggested: DocumentKind | null
  onUpload: () => void
}) {
  const isTransport = isTransportKind(slot.kind)
  const title = isTransport
    ? LOGICAL_DOC_TYPE_LABELS.transport_document
    : (DOCUMENT_KIND_LABELS[slot.kind as DocumentKind] ?? slot.kind)
  const variantLabel = isTransport && suggested ? DOCUMENT_KIND_LABELS[suggested] : null
  return (
    // §3.6: на 375 px строка — карточка в столбик, кнопка «Загрузить»
    // — на всю ширину (цель ≥ 44 × 44); на десктопе — строка.
    <div className="border rounded-lg p-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3 flex-wrap opacity-80">
      <div className="flex items-center gap-2 flex-wrap min-w-0">
        <Badge variant="outline" className="text-xs">
          {slot.status === 'none' ? 'Ожидается' : slotStatusLabel(slot.status)}
        </Badge>
        <span className="text-sm font-medium truncate">{title}</span>
        {variantLabel && (
          <span className="text-xs text-muted-foreground">вариант: {variantLabel}</span>
        )}
        {slot.provider && (
          <span className="text-xs text-muted-foreground">
            ожидается от {DOC_PROVIDER_LABELS[slot.provider as DocProvider].toLowerCase()}
          </span>
        )}
        {(slot.requiredFor ?? []).map((r) =>
          r.blocking ? (
            <Badge key={r.stageCode} variant="version" className="text-xs">
              обязательно для этапа: {r.stageName}
            </Badge>
          ) : (
            <span key={r.stageCode} className="text-xs text-muted-foreground">
              рекомендуется для этапа: {r.stageName}
            </span>
          ),
        )}
      </div>
      <Button size="sm" variant="outline" onClick={onUpload} className="h-11 md:h-8 w-full md:w-auto">
        <Plus className="size-4" />
        Загрузить
      </Button>
    </div>
  )
}
