'use client'

import { useState } from 'react'
import { Loader2, UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'
import { formatPhoneInput } from '@/lib/phone'
import { EMPLOYEE_PASSWORD_MIN } from '@/lib/employees'
import { RoleChips } from './RoleChips'
import { generatePassword } from './password'
import type { EmployeeRoleName } from '@/lib/employees'

// v0.5.0 (P1-22): диалог создания сотрудника — выезд из
// EmployeesList.tsx (резка под лимит 300, RULES 2.14). Логика 1:1:
// телефон — логин кабинета (маска на вводе), пароль генерируется
// или вводится, роли чипами (по умолчанию «Менеджер»).
export function EmployeeCreateDialog({ onCreated }: { onCreated: () => void }) {
  const { toast } = useToast()

  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [roles, setRoles] = useState<EmployeeRoleName[]>(['manager'])

  const handleCreate = async () => {
    if (!name.trim()) {
      toast({ title: 'Укажите имя сотрудника', variant: 'destructive' })
      return
    }
    if (password.length < EMPLOYEE_PASSWORD_MIN) {
      toast({
        title: `Пароль — минимум ${EMPLOYEE_PASSWORD_MIN} символов`,
        variant: 'destructive',
      })
      return
    }
    setCreating(true)
    try {
      const res = await fetch('/api/admin/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), phone, password, roles }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Не удалось создать сотрудника')

      toast({
        title: `Сотрудник «${data.employee.name}» создан`,
        description: `Логин: ${data.employee.phone}. Передайте пароль сотруднику лично.`,
      })
      setOpen(false)
      setName('')
      setPhone('')
      setPassword('')
      setRoles(['manager'])
      onCreated()
    } catch (e) {
      toast({
        title: 'Ошибка создания',
        description: e instanceof Error ? e.message : '',
        variant: 'destructive',
      })
    } finally {
      setCreating(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <UserPlus className="size-4" />
          Новый сотрудник
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Новый сотрудник</DialogTitle>
          <DialogDescription>
            Телефон — логин кабинета, пароль передайте сотруднику лично.
            Роль «Мастер» даёт управление этим справочником.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="emp-name">Имя</Label>
            <Input
              id="emp-name"
              placeholder="Иван Петров"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="emp-phone">Телефон (логин)</Label>
            <Input
              id="emp-phone"
              inputMode="tel"
              placeholder="+7 (900) 555-01-02"
              value={phone}
              onChange={(e) => setPhone(formatPhoneInput(e.target.value))}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="emp-password">Стартовый пароль</Label>
            <div className="flex gap-2">
              <Input
                id="emp-password"
                value={password}
                placeholder={`Минимум ${EMPLOYEE_PASSWORD_MIN} символов`}
                onChange={(e) => setPassword(e.target.value)}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => setPassword(generatePassword())}
              >
                Сгенерировать
              </Button>
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Роли</Label>
            <RoleChips value={roles} onChange={setRoles} masterLocked={false} idPrefix="emp-create" />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={handleCreate} disabled={creating}>
            {creating && <Loader2 className="size-4 animate-spin" />}
            Создать
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
