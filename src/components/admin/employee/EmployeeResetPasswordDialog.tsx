'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
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
import { EMPLOYEE_PASSWORD_MIN } from '@/lib/employees'
import { generatePassword } from './password'
import type { EmployeeRow } from './types'

// v0.5.0 (P1-22): диалог сброса пароля сотрудника — выезд из
// EmployeesList.tsx (резка под лимит 300, RULES 2.14). Логика 1:1:
// все сессии завершаются, включая текущую при само-сбросе; новый
// пароль передаётся сотруднику лично.
export function EmployeeResetPasswordDialog({
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

  const [password, setPassword] = useState('')
  const [resetting, setResetting] = useState(false)

  useEffect(() => {
    if (row) setPassword('')
  }, [row])

  const handleReset = async () => {
    if (!row) return
    if (password.length < EMPLOYEE_PASSWORD_MIN) {
      toast({
        title: `Пароль — минимум ${EMPLOYEE_PASSWORD_MIN} символов`,
        variant: 'destructive',
      })
      return
    }
    setResetting(true)
    try {
      const res = await fetch(`/api/admin/employees/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Не удалось сбросить пароль')

      toast({
        title: `Пароль «${row.name}» обновлён`,
        description:
          row.id === currentEmployeeId
            ? 'Ваша сессия завершена — войдите с новым паролем заново.'
            : 'Все сессии сотрудника завершены. Передайте новый пароль лично.',
      })
      onSaved()
    } catch (e) {
      toast({
        title: 'Ошибка сброса пароля',
        description: e instanceof Error ? e.message : '',
        variant: 'destructive',
      })
    } finally {
      setResetting(false)
    }
  }

  return (
    <Dialog open={row !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        {row && (
          <>
            <DialogHeader>
              <DialogTitle>Сброс пароля — {row.name}</DialogTitle>
              <DialogDescription>
                Все сессии сотрудника будут завершены, включая текущую, если
                сбрасываете пароль себе. Новый пароль передайте сотруднику лично.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-2">
              <Label htmlFor="emp-reset-password">Новый пароль</Label>
              <div className="flex gap-2">
                <Input
                  id="emp-reset-password"
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
            <DialogFooter>
              <Button onClick={handleReset} disabled={resetting}>
                {resetting && <Loader2 className="size-4 animate-spin" />}
                Сбросить пароль
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
