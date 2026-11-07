'use client'

import { Badge } from '@/components/ui/badge'
import { PERMIT_BADGE_VARIANTS } from '@/lib/status-badges'
import { fmtPermitDate } from '@/lib/permits'
import type { PermitCheckUi } from './registry-types'

// ─── DF-26 волна 2 (§3.3.3/§5.1/§5.6): строка проверки ТН ВЭД в фазе
// «07 · Разрешительные». Только admin/broker (§7). Теги §3.5 —
// существующие пары: ТРЕБУЕТ УТОЧНЕНИЯ (unclear, движение), ТРЕБУЕТ
// ПЕРЕСМОТРА (needs_review, движение), ТРЕБУЕТСЯ / НЕ ТРЕБУЕТСЯ /
// НЕ ВЫПОЛНЕНА (исходы). История пересмотра — строка с исходом и
// снимками; скрытых операций нет (§5.7 п. 5).

const CHECK_RESULT_LABELS: Record<string, string> = {
  required: 'ТРЕБУЕТСЯ',
  not_required: 'НЕ ТРЕБУЕТСЯ',
  unclear: 'ТРЕБУЕТ УТОЧНЕНИЯ',
  failed: 'НЕ ВЫПОЛНЕНА',
}

const CHECK_OUTCOME_LABELS: Record<string, string> = {
  requirement_kept: 'требование остаётся в силе',
  requirement_waived: 'требование снято',
  new_requirement: 'создано новое требование',
  not_required: 'не требуется по коду',
  unclear_confirmed: 'данных всё ещё недостаточно',
  mixed: 'часть осталась, часть снята/заменена',
}

export function RegistryCheckRow({ check }: { check: PermitCheckUi }) {
  const needsReview = check.reviewStatus === 'needs_review'
  const label = needsReview
    ? 'ТРЕБУЕТ ПЕРЕСМОТРА'
    : (CHECK_RESULT_LABELS[check.result] ?? check.result)
  // needs_review — движение (пара transit); исходы — по результату.
  const variant = needsReview
    ? 'transit'
    : (PERMIT_BADGE_VARIANTS[check.result === 'required' ? 'received' : 'pending'] ?? 'version')
  const checkedBy =
    check.checkedByUserName && check.checkedByCompanyName
      ? `${check.checkedByUserName} (${check.checkedByCompanyName})`
      : (check.checkedByName || '')
  return (
    <div className="rounded-lg border px-3 py-2.5 md:py-2 grid gap-1.5 min-w-0">
      <div className="flex flex-wrap items-center gap-2 min-w-0">
        <Badge variant={variant as never} className="text-xs">
          {label}
        </Badge>
        <span className="text-sm font-medium tabular-nums">
          {check.hsCode.slice(0, 4)} {check.hsCode.slice(4, 6)} {check.hsCode.slice(6, 8)} {check.hsCode.slice(8, 10)}
        </span>
        {check.source === 'auto' && (
          <Badge variant="outline" className="text-xs">
            авто
          </Badge>
        )}
        <span className="text-xs text-muted-foreground">
          позиций охвачено: {check.items.length}
        </span>
      </div>
      <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <span>проверка ТН ВЭД</span>
        {check.basis && (
          <>
            <span>·</span>
            <span className="min-w-0 break-words">основание: {check.basis}</span>
          </>
        )}
        <span>·</span>
        <span>
          {checkedBy ? `${checkedBy}, ` : ''}
          {fmtPermitDate(new Date(check.createdAt))}
        </span>
        {check.reviewStatus === 'reviewed' && check.reviewOutcome && (
          <>
            <span>·</span>
            <span>
              пересмотрено {check.reviewedAt ? fmtPermitDate(new Date(check.reviewedAt)) : ''}:{' '}
              {CHECK_OUTCOME_LABELS[check.reviewOutcome] ?? check.reviewOutcome}
              {check.reviewedByUserName ? ` (${check.reviewedByUserName})` : ''}
            </span>
          </>
        )}
      </div>
    </div>
  )
}
