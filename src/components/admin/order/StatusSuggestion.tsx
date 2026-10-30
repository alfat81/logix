'use client'

// DF-06: подсказка статуса заявки по этапам. Видна только сотрудникам
// (страница /admin за requireEmployee) и только когда матрица переходов
// разрешает подсказанный переход (проверка — внутри suggestOrderStatus).
// Ручной Select статуса не меняется — подсказка лишь ускоряет частые
// шаги одним нажатием; применение — существующий PATCH заявки.
import { useState } from 'react'
import { Lightbulb, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { suggestOrderStatus } from '@/lib/status-suggest'
import type { OrderStatus, StageStatus } from '@/lib/order-constants'

export function StatusSuggestion({
  stages,
  current,
  onApply,
}: {
  stages: ReadonlyArray<{ status: StageStatus }>
  current: OrderStatus
  onApply: (to: OrderStatus) => Promise<boolean>
}) {
  const suggestion = suggestOrderStatus(stages, current)
  const [applying, setApplying] = useState(false)
  if (!suggestion) return null

  const apply = async () => {
    setApplying(true)
    try {
      await onApply(suggestion.to)
    } finally {
      setApplying(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
      <Lightbulb className="size-4 shrink-0" aria-hidden />
      <span>{suggestion.question}</span>
      <Button variant="outline" size="sm" onClick={apply} disabled={applying}>
        {applying && <Loader2 className="size-4 animate-spin" aria-hidden />}
        {suggestion.button}
      </Button>
    </div>
  )
}
