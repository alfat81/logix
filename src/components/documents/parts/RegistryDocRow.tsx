'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight, Lock } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { DOCUMENT_BADGE_VARIANTS } from '@/lib/status-badges'
import {
  DOCUMENT_KIND_LABELS,
  type DocumentKind,
  type DocumentStatus,
} from '@/lib/document-constants'
import { DocumentCard } from './DocumentCard'
import { AUTHOR_ROLE_LABELS, kindLabel, type DocRowUi } from './types'

// ─── DF-26 §3.3: строка документа реестра ────────────────────────────
// Компактная строка (вид + название + статус + версия + автор «Имя ·
// Компания» + метка видимости), раскрытие по запросу — внутри полная
// карточка DocumentCard (история версий, действия — переиспользование
// IC-14, без копий). Чекбокс — режим «Выбранные…» ZIP; сотруднику —
// смена привязки к этапу (PATCH stageCode, закрытие AUD-11).

export type RegistryStageOption = { stageCode: string; name: string }

export function RegistryDocRow({
  doc,
  selectable,
  selected,
  onToggle,
  versionsUrlFor,
  deleteUrlFor,
  lifecycleUrlFor,
  submitUrlFor,
  stagePatchUrlFor,
  stages,
  onVersion,
  onDone,
}: {
  doc: DocRowUi
  selectable: boolean
  selected: boolean
  onToggle: (docId: string, checked: boolean) => void
  versionsUrlFor: (docId: string) => string
  deleteUrlFor?: (docId: string) => string
  lifecycleUrlFor?: (docId: string) => string
  submitUrlFor?: (docId: string) => string
  /** PATCH этапа (сотрудник); нет пропса — селекта нет */
  stagePatchUrlFor?: (docId: string) => string
  stages: RegistryStageOption[]
  onVersion: (doc: DocRowUi) => void
  onDone: () => Promise<void>
}) {
  const [expanded, setExpanded] = useState(false)
  const author = doc.versions[0]
  const kind = kindLabel(doc)

  return (
    <div className="border rounded-lg p-2.5 space-y-2">
      <div className="flex items-center gap-2 min-w-0 flex-wrap">
        {selectable && (
          <Checkbox
            aria-label={`Выбрать «${doc.title}»`}
            checked={selected}
            onCheckedChange={(v) => onToggle(doc.id, v === true)}
            className="shrink-0"
          />
        )}
        <button
          type="button"
          onClick={() => setExpanded((x) => !x)}
          className="flex items-center gap-1 text-muted-foreground shrink-0 p-2 -m-1"
          aria-expanded={expanded}
          aria-label={expanded ? 'Свернуть строку' : 'Раскрыть строку'}
        >
          {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        </button>
        <span className="font-medium text-sm truncate min-w-0">{doc.title}</span>
        <Badge variant="secondary" className="text-xs shrink-0">
          {kind}
        </Badge>
        <Badge
          variant={DOCUMENT_BADGE_VARIANTS[doc.status as DocumentStatus] ?? 'version'}
          className="text-xs gap-1 shrink-0"
        >
          {doc.status === 'final' && <Lock className="size-3" />}
          {doc.status === 'draft' && 'Черновик'}
          {doc.status === 'in_review' && 'На проверке'}
          {doc.status === 'final' && 'Финальный'}
        </Badge>
        <Badge variant="version" className="text-xs shrink-0">
          v{doc.currentVersion}
        </Badge>
        {author && (
          <span className="text-xs text-muted-foreground truncate min-w-0">
            {author.authorName} · {AUTHOR_ROLE_LABELS[author.authorType] ?? author.authorType}
          </span>
        )}
        <span className="ml-auto shrink-0">
          {doc.isInternal ? (
            <Badge variant="outline" className="text-xs gap-1">
              <Lock className="size-3" />
              внутреннее
            </Badge>
          ) : (
            <span className="text-xs text-muted-foreground">видно клиенту</span>
          )}
        </span>
      </div>

      {expanded && (
        <div className="space-y-2 pl-6">
          {stagePatchUrlFor && (
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground shrink-0">Этап</Label>
              <Select
                value={doc.stageCode ?? UNSET_STAGE}
                onValueChange={(v) => {
                  void patchStage(stagePatchUrlFor(doc.id), v === UNSET_STAGE ? null : v, onDone)
                }}
              >
                <SelectTrigger aria-label="Этап документа" size="sm" className="w-64">
                  <SelectValue placeholder="— не привязан —" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNSET_STAGE}>— не привязан —</SelectItem>
                  {stages.map((s) => (
                    <SelectItem key={s.stageCode} value={s.stageCode}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <DocumentCard
            doc={doc}
            versionsUrlFor={versionsUrlFor}
            deleteUrlFor={deleteUrlFor}
            lifecycleUrlFor={lifecycleUrlFor}
            submitUrlFor={submitUrlFor}
            onVersion={onVersion}
            onDone={onDone}
          />
        </div>
      )}
      {!expanded && (
        <p className="text-xs text-muted-foreground pl-8 truncate">
          {DOCUMENT_KIND_LABELS[doc.kind as DocumentKind] ?? kind} · {doc.versions.length} верси
          {doc.versions.length === 1 ? 'я' : doc.versions.length < 5 ? 'и' : 'й'}
        </p>
      )}
    </div>
  )
}

async function patchStage(url: string, stageCode: string | null, onDone: () => Promise<void>) {
  // Смена привязки к этапу — тихая правка строки; результат —
  // перезагрузка реестра (событие document_stage_changed в ленте).
  await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stageCode }),
  })
  await onDone()
}

const UNSET_STAGE = '__unset__'
