'use client'

import { Pencil } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { requisitesInn } from '@/lib/requisite-fields'
import type { LegalEntityRow } from './types'

// v0.5.0 (P1-22, BRANDBOOK §4.3-lite): карточка юрлица в единой
// анатомии справочников: строка 1 — «с {дата}» (tabular) + признак
// деактивации; строка 2 — название Bold; строка 3 — ИНН/реквизиты.
// Правый блок — счётчики договоров и заявок (как ETA-блок) и правка.
export function LegalEntityCard({
  row,
  onEdit,
}: {
  row: LegalEntityRow
  onEdit: (row: LegalEntityRow) => void
}) {
  const inn = requisitesInn(row.requisites)
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground tabular-nums">
              с {new Date(row.createdAt).toLocaleDateString('ru-RU')}
            </span>
            {!row.isActive && <Badge variant="secondary">Не активен</Badge>}
          </div>
          <div className="mt-0.5 truncate font-semibold">{row.name}</div>
          <div className="mt-0.5 truncate text-sm text-muted-foreground">
            {inn ? `ИНН ${inn}` : 'Реквизиты не заполнены'}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-sm font-semibold tabular-nums">
            Договоры: {row.contractsCount}
          </div>
          <div className="text-xs text-muted-foreground tabular-nums">
            Заявки: {row.ordersCount}
          </div>
          <Button variant="outline" size="sm" className="mt-1" onClick={() => onEdit(row)}>
            <Pencil className="size-4" />
            Править
          </Button>
        </div>
      </div>
    </Card>
  )
}
