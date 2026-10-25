import type { EmployeeRoleName } from '@/lib/employees'

// v0.5.0 (P1-22): типы справочника сотрудников — выезд из
// EmployeesList.tsx (резка под лимит 300, RULES 2.14).
// Права и ограничения описаны в компоненте списка: правка/сброс —
// только мастер (защищает API), «себя» — блокировки UI.

export type EmployeeRow = {
  id: string
  name: string
  phone: string
  roles: EmployeeRoleName[]
  isActive: boolean
  createdAt: string
}

export type EmployeesPage = {
  employees: EmployeeRow[]
  hasMore: boolean
  counts: { all: number }
}

export const EMPLOYEE_SORTS = [
  { value: 'name_asc', label: 'Имя А-Я' },
  { value: 'name_desc', label: 'Имя Я-А' },
  { value: 'newest', label: 'Сначала новые' },
  { value: 'oldest', label: 'Сначала старые' },
]
