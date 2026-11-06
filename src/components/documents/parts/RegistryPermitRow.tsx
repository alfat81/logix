'use client'

import { FileUp } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  PERMIT_PROVIDER_LABELS,
  fmtPermitDate,
  type PermitProvider,
} from '@/lib/permits'
import { PERMIT_BADGE_VARIANTS } from '@/lib/status-badges'
import { PermitEditDialog } from '@/components/permits/PermitDialogs'
import type { PermitRowUi } from '@/components/permits/types'
import type { PermitLiteUi } from './registry-types'

// ─── DF-26 §3.3.3: строка разрешительного требования в анатомии
// реестра. Требование показывается в фазе своего этапа (stagePhase;
// в очереди №21 — остаточная группа 07), файл, закрывающий требование,
// показывается один раз — внутри строки (без дубля отдельной строкой).
// Статусы §3.5 (теги ЗАГЛАВНЫМИ): ОЖИДАЕТСЯ / ПОЛУЧЕН / НЕ ТРЕБУЕТСЯ;
// варианты пар — канонический PERMIT_BADGE_VARIANTS (§3.2). Действия:
// «Загрузить» — единая форма «Новый документ» (§3.3.6, T21-02);
// «Править»/«Не требуется» — только сотрудник. Кнопок
// «Принять/Отклонить» нет — submitted/accept/reject — волна 2
// (разрез Р-2, протокол отклонения от макета 10 в отчёте гейта 1).

const PERMIT_ROW_LABELS: Record<string, string> = {
  pending: 'ОЖИДАЕТСЯ',
  received: 'ПОЛУЧЕН',
  waived: 'НЕ ТРЕБУЕТСЯ',
}

export function RegistryPermitRow({
  permit,
  file,
  patchUrlFor,
  onSaved,
  onUpload,
}: {
  permit: PermitLiteUi
  /** Документ, закрывающий требование (один раз — внутри строки). */
  file?: { fileName: string; currentVersion: number; onOpen: () => void; onNewVersion: () => void } | null
  /** PATCH строки (сотрудник) — триггер «Править» и «Не требуется» */
  patchUrlFor?: (permitId: string) => string
  onSaved: () => Promise<void>
  onUpload: () => void
}) {
  const label = PERMIT_ROW_LABELS[permit.status] ?? permit.status
  const variant = PERMIT_BADGE_VARIANTS[permit.status as keyof typeof PERMIT_BADGE_VARIANTS] ?? 'version'
  const due = permit.neededBy ? new Date(permit.neededBy) : null
  // Чистый рендер: точка сравнения — как в PermitsSection (new Date()
  // в теле компонента, без эффектов)
  const now = new Date()
  const overdueBlocking =
    permit.status === 'pending' && permit.isBlocking && due != null && due.getTime() < now.getTime()
  return (
    <div
      className={`rounded-lg border px-3 py-2.5 md:py-2 grid gap-1.5 min-w-0 ${
        overdueBlocking ? 'border-destructive/40' : ''
      }`}
    >
      <div className="flex flex-wrap items-center gap-2 min-w-0">
        <Badge variant={variant} className="text-xs">
          {label}
        </Badge>
        <span className="text-sm font-medium break-words min-w-0">{permit.title}</span>
        {permit.isBlocking && (
          <Badge variant={overdueBlocking ? 'critical' : 'outline'} className="text-xs">
            {overdueBlocking ? 'ПРОСРОЧЕНО' : 'Блокирует'}
          </Badge>
        )}
        <span className="text-xs text-muted-foreground tabular-nums">
          {due ? `до ${fmtPermitDate(due)}` : 'без срока'}
        </span>
      </div>
      <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <span>разрешительное требование</span>
        <span>·</span>
        <span>предоставит: {PERMIT_PROVIDER_LABELS[permit.providedBy as PermitProvider]?.toLowerCase() ?? permit.providedBy}</span>
        {permit.status === 'received' && permit.receivedAt && (
          <>
            <span>·</span>
            <span>
              получен {fmtPermitDate(new Date(permit.receivedAt))}
              {permit.receivedByName ? ` (${permit.receivedByName})` : ''}
            </span>
          </>
        )}
        {permit.status === 'waived' && permit.waivedReason && (
          <>
            <span>·</span>
            <span>{permit.waivedReason}</span>
          </>
        )}
      </div>
      {/* Файл, закрывающий требование, — внутри строки (§3.3.3), без
          дубля отдельной строкой реестра. */}
      {file && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 px-2 py-1.5 min-w-0">
          <button
            type="button"
            onClick={file.onOpen}
            className="text-xs font-medium underline underline-offset-4 hover:text-foreground truncate max-w-56"
            title="История версий"
          >
            {file.fileName}
          </button>
          <span className="text-xs text-muted-foreground">v{file.currentVersion}</span>
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={file.onNewVersion}>
            Новая версия
          </Button>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 pt-0.5">
        {permit.status === 'pending' && (
          <Button size="sm" variant="outline" className="h-11 md:h-8" onClick={onUpload}>
            <FileUp className="size-3.5" />
            Загрузить
          </Button>
        )}
        {patchUrlFor && (
          <PermitEditDialog
            permit={permit as PermitRowUi}
            patchUrlFor={patchUrlFor}
            onSaved={onSaved}
          />
        )}
      </div>
    </div>
  )
}
