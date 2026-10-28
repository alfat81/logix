'use client'

import { useEffect, useState } from 'react'
import { Loader2, ShieldCheck, ShieldOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'
import { formatPhoneInput } from '@/lib/phone'
import type { EmployeeRoleName } from '@/lib/employees'
import { RoleChips } from './RoleChips'
import type { EmployeeRow } from './types'

// v0.5.0 (P1-22): диалог правки сотрудника (имя, телефон-логин, роли +
// деактивация в футере) — выезд из EmployeesList.tsx (резка под лимит
// 300, RULES 2.14). Логика 1:1: смена телефона и ролей применяется к
// активным сессиям сразу; себя нельзя ни разжаловать, ни
// деактивировать (кнопки честно объясняют, API защищает).
export function EmployeeEditDialog({
  row,
  currentEmployeeId,
  onClose,
  onSaved,
}: {
  row: EmployeeRow | null
  currentEmployeeId: string
  onClose: () => void
  onSaved: () => void
}) {
  const { toast } = useToast()

  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [roles, setRoles] = useState<EmployeeRoleName[]>([])
  const [saving, setSaving] = useState(false)
  const [togglingActive, setTogglingActive] = useState(false)

  // Поля наполняются заново при каждом открытии
  useEffect(() => {
    if (row) {
      setName(row.name)
      setPhone(row.phone)
      setEmail(row.email ?? '')
      setRoles(row.roles.length > 0 ? [...row.roles] : ['manager'])
    }
  }, [row])

  const handleSave = async () => {
    if (!row) return
    if (!name.trim()) {
      toast({ title: 'Укажите имя сотрудника', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/employees/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          phone,
          // null = очистить email (DF-02: пустое поле в форме — «email нет»)
          email: email.trim() ? email.trim() : null,
          roles,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Не удалось сохранить сотрудника')

      toast({ title: `Сотрудник «${data.employee.name}» сохранён` })
      onSaved()
    } catch (e) {
      toast({
        title: 'Ошибка сохранения',
        description: e instanceof Error ? e.message : '',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  const handleToggleActive = async () => {
    if (!row) return
    const wasActive = row.isActive
    setTogglingActive(true)
    try {
      const res = await fetch(`/api/admin/employees/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !wasActive }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Не удалось изменить статус')

      toast({
        title: wasActive
          ? `Сотрудник «${data.employee.name}» деактивирован`
          : `Сотрудник «${data.employee.name}» снова активен`,
        description: wasActive
          ? 'Вход заблокирован, сессии завершены. История его действий сохранена.'
          : undefined,
      })
      onSaved()
    } catch (e) {
      toast({
        title: 'Ошибка изменения статуса',
        description: e instanceof Error ? e.message : '',
        variant: 'destructive',
      })
    } finally {
      setTogglingActive(false)
    }
  }

  const isSelf = row?.id === currentEmployeeId

  return (
    <Dialog open={row !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        {row && (
          <>
            <DialogHeader>
              <DialogTitle>Правка сотрудника</DialogTitle>
              <DialogDescription>
                Смена телефона и ролей применяется к активным сессиям сразу.
                {' '}Деактивация блокирует вход и завершает сессии, история действий сохраняется.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="emp-edit-name">Имя</Label>
                <Input id="emp-edit-name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="emp-edit-phone">Телефон (логин)</Label>
                <Input
                  id="emp-edit-phone"
                  inputMode="tel"
                  value={phone}
                  onChange={(e) => setPhone(formatPhoneInput(e.target.value))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="emp-edit-email">Email для уведомлений</Label>
                <Input
                  id="emp-edit-email"
                  type="email"
                  placeholder="name@company.ru (необязательно)"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label>Роли</Label>
                <RoleChips
                  value={roles}
                  onChange={setRoles}
                  masterLocked={isSelf}
                  idPrefix="emp-edit"
                />
                {isSelf && (
                  <p className="text-xs text-muted-foreground">
                    Себя нельзя разжаловать из мастеров — в системе всегда
                    должен остаться хотя бы один.
                  </p>
                )}
              </div>
            </div>
            <DialogFooter className="sm:justify-between">
              <Button
                variant="outline"
                onClick={handleToggleActive}
                disabled={togglingActive || saving || isSelf}
                title={isSelf ? 'Нельзя деактивировать свой аккаунт' : undefined}
              >
                {togglingActive ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : row.isActive ? (
                  <ShieldOff className="size-4" />
                ) : (
                  <ShieldCheck className="size-4" />
                )}
                {isSelf ? 'Это вы' : row.isActive ? 'Деактивировать' : 'Снова активен'}
              </Button>
              <Button onClick={handleSave} disabled={saving || togglingActive}>
                {saving && <Loader2 className="size-4 animate-spin" />}
                Сохранить
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
