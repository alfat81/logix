'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

// ─── P1-01: ответственный менеджер в карточках лида и заявки ────────
//
// Справочник сотрудников читает только мастер (Ж6в: список раскрывает
// телефоны и роли учёток) — у менеджера поле деградирует в read-only
// подпись, имя ответственного при этом видно (оно приезжает в самой
// карточке). PATCH выполняет родитель — у него уже есть patchLead /
// patchOrder с тостами и перезагрузкой ленты; компонент только
// выбирает сотрудника и показывает процесс сохранения.

type EmployeeOption = { id: string; name: string; isActive: boolean }

export function AssigneeField({
  value,
  currentName,
  onSave,
}: {
  // Текущий ответственный: id (null = не назначен)
  value: string | null
  // Имя для read-only показа (приезжает из карточки)
  currentName: string | null
  // Сохранение силами родителя: PATCH + перезагрузка карточки.
  // true = успех, false = ошибка (родитель уже показал тост)
  onSave: (employeeId: string | null) => Promise<boolean>
}) {
  // null = справочник недоступен (менеджер) или ещё грузится —
  // в обоих случаях показываем read-only, без лишнего мигания
  const [employees, setEmployees] = useState<EmployeeOption[] | null>(null)
  const [saving, setSaving] = useState(false)

  // 403 менеджера — не ошибка, а режим «только чтение»: молча остаёмся
  // в read-only. Обновление справочника после смены сотрудника —
  // перезагрузкой страницы (карточка и так перезагружает данные).
  useEffect(() => {
    let alive = true
    fetch('/api/admin/employees')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (alive) setEmployees(d?.employees ?? null)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  const handleChange = async (v: string) => {
    if (saving) return
    setSaving(true)
    try {
      await onSave(v === 'none' ? null : v)
    } finally {
      setSaving(false)
    }
  }

  // Деактивированные в выборе не участвуют: сервер их всё равно
  // отвергнет (проверка isActive в роуте), показывать их — ловушка
  const assignable = employees?.filter((e) => e.isActive) ?? []

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-muted-foreground">Ответственный:</span>
      {employees === null ? (
        <span className="font-medium">{currentName ?? '— не назначен'}</span>
      ) : (
        <>
          <Select value={value ?? 'none'} onValueChange={handleChange} disabled={saving}>
            <SelectTrigger size="sm" className="w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <div className="max-h-64 overflow-y-auto">
                <SelectItem value="none">— не назначен —</SelectItem>
                {assignable.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.name}
                  </SelectItem>
                ))}
              </div>
            </SelectContent>
          </Select>
          {saving && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
        </>
      )}
    </div>
  )
}
