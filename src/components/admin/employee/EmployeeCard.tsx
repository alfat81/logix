'use client'

import { KeyRound, Pencil } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import type { EmployeeRow } from './types'

// v0.5.0 (P1-22, BRANDBOOK §4.3-lite): карточка сотрудника в единой
// анатомии справочников: строка 1 — «с {дата}» (tabular) + признаки
// («Это вы», «Не активен»); строка 2 — имя Bold; строка 3 — телефон
// (логин, tabular). Правый блок — роли бейджами и действия (правка,
// сброс пароля) — тексты и условия 1:1.
export function EmployeeCard({
  row,
  currentEmployeeId,
  onEdit,
  onReset,
}: {
  row: EmployeeRow
  currentEmployeeId: string
  onEdit: (row: EmployeeRow) => void
  onReset: (row: EmployeeRow) => void
}) {
  const isSelf = row.id === currentEmployeeId
  return (
    <Card className="p-4">
      {/* flex-wrap: на узких экранах правый блок переносится под левый
          (паттерн прежней карточки; P1-22 — анатомия §4.3-lite) */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground tabular-nums">
              с {new Date(row.createdAt).toLocaleDateString('ru-RU')}
            </span>
            {isSelf && <Badge variant="outline">Это вы</Badge>}
            {!row.isActive && <Badge variant="secondary">Не активен</Badge>}
          </div>
          <div className="mt-0.5 truncate font-semibold">{row.name}</div>
          <div className="mt-0.5 truncate text-sm text-muted-foreground tabular-nums">
            {row.phone}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            {row.roles.includes('master') && <Badge>Мастер</Badge>}
            {row.roles.includes('manager') && <Badge variant="secondary">Менеджер</Badge>}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => onEdit(row)}>
              <Pencil className="size-4" />
              Править
            </Button>
            <Button variant="outline" size="sm" onClick={() => onReset(row)}>
              <KeyRound className="size-4" />
              Сброс пароля
            </Button>
          </div>
        </div>
      </div>
    </Card>
  )
}
