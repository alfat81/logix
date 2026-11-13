'use client'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { DocProvider } from '@/lib/document-constants'
import { STAGE_DOC_PROVIDER_LABELS } from '@/lib/stage-doc-requirements'

// Селект поставщика — один и тот же в строке требования и в форме
// добавления (значения — словарь DF-13 «кто предоставляет»).
// Вынесено из StageRequirementsDialog (RULES 2.14: файл ≤ 300 строк).

export function ProviderSelect({
  value,
  onValue,
  disabled,
  className,
}: {
  value: DocProvider
  onValue: (v: DocProvider) => void
  disabled?: boolean
  className?: string
}) {
  return (
    <Select value={value} onValueChange={(v) => onValue(v as DocProvider)} disabled={disabled}>
      <SelectTrigger aria-label="Источник документов этапа" className={className}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {(Object.keys(STAGE_DOC_PROVIDER_LABELS) as DocProvider[]).map((p) => (
          <SelectItem key={p} value={p}>
            {STAGE_DOC_PROVIDER_LABELS[p]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
