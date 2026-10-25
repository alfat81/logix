'use client'

import { Button } from '@/components/ui/button'
import {
  EMPLOYEE_ROLES,
  EMPLOYEE_ROLE_LABELS,
  type EmployeeRoleName,
} from '@/lib/employees'

// v0.5.0 (P1-22): чипы-переключатели ролей сотрудника — выезд из
// EmployeesList.tsx (резка под лимит 300, RULES 2.14). Одна роль —
// одна кнопка, выбранные подсвечены. masterLocked — защита «себя
// не разжаловать» (API всё равно не пустит, кнопка честно объясняет
// почему). Последнюю роль снять нельзя — серверу нужен непустой
// массив (пустой = учётка-замок, вход с ролями 403).
export function RoleChips({
  value,
  onChange,
  masterLocked,
  idPrefix,
}: {
  value: EmployeeRoleName[]
  onChange: (next: EmployeeRoleName[]) => void
  masterLocked: boolean
  idPrefix: string
}) {
  const toggle = (role: EmployeeRoleName) => {
    if (value.includes(role)) {
      if (value.length === 1) return
      onChange(value.filter((r) => r !== role))
    } else {
      onChange([...value, role])
    }
  }
  return (
    <div className="flex flex-wrap gap-2">
      {EMPLOYEE_ROLES.map((role) => {
        const active = value.includes(role)
        const locked = role === 'master' && masterLocked
        return (
          <Button
            key={role}
            id={`${idPrefix}-role-${role}`}
            type="button"
            size="sm"
            variant={active ? 'default' : 'outline'}
            aria-pressed={active}
            disabled={locked}
            title={locked ? 'Нельзя снять с себя роль мастера' : undefined}
            onClick={() => toggle(role)}
          >
            {EMPLOYEE_ROLE_LABELS[role]}
          </Button>
        )
      })}
    </div>
  )
}
