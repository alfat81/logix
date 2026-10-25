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
import { RequisitesFields } from './RequisitesFields'
import {
  formToRequisites,
  requisitesToForm,
  type LegalEntityRow,
  type RequisitesFormState,
} from './types'

// v0.5.0 (P1-22): диалог правки юрлица (имя + реквизиты + деактивация
// в футере) — выезд из LegalEntitiesList.tsx (резка под лимит 300,
// RULES 2.14). Логика 1:1: реквизиты сохраняются целиком — пустые
// поля удалят ранее заполненные значения; деактивация скрывает
// юрлицо из выбора при создании заявки, не трогая договоры/заявки.
export function LegalEntityEditDialog({
  row,
  onClose,
  onSaved,
}: {
  row: LegalEntityRow | null
  onClose: () => void
  onSaved: () => void
}) {
  const { toast } = useToast()

  const [name, setName] = useState('')
  const [requisites, setRequisites] = useState<RequisitesFormState>({})
  const [saving, setSaving] = useState(false)
  const [togglingActive, setTogglingActive] = useState(false)

  // Поля наполняются заново при каждом открытии
  useEffect(() => {
    if (row) {
      setName(row.name)
      setRequisites(requisitesToForm(row.requisites))
    }
  }, [row])

  const handleSave = async () => {
    if (!row) return
    if (!name.trim()) {
      toast({ title: 'Укажите название юрлица', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/legal-entities/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), requisites: formToRequisites(requisites) }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Не удалось сохранить юрлицо')

      toast({ title: `Юрлицо «${data.legalEntity.name}» сохранено` })
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
      const res = await fetch(`/api/admin/legal-entities/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !wasActive }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Не удалось изменить статус')

      toast({
        title: wasActive
          ? `Юрлицо «${data.legalEntity.name}» деактивировано`
          : `Юрлицо «${data.legalEntity.name}» снова активно`,
        description: wasActive
          ? 'Скрыто из выбора при создании заявки; в старых договорах и заявках осталось.'
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

  return (
    <Dialog open={row !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md sm:max-h-[85vh] overflow-y-auto">
        {row && (
          <>
            <DialogHeader>
              <DialogTitle>Правка юрлица</DialogTitle>
              <DialogDescription>
                Реквизиты сохраняются целиком: пустые поля удалят ранее заполненные
                значения. Деактивация скрывает юрлицо из выбора при создании заявки,
                но не трогает существующие договоры и заявки.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="le-edit-name">Название</Label>
                <Input
                  id="le-edit-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <RequisitesFields form={requisites} onChange={setRequisites} idPrefix="le-edit" />
            </div>
            <DialogFooter className="sm:justify-between">
              <Button
                variant="outline"
                onClick={handleToggleActive}
                disabled={togglingActive || saving}
              >
                {togglingActive ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : row.isActive ? (
                  <ShieldOff className="size-4" />
                ) : (
                  <ShieldCheck className="size-4" />
                )}
                {row.isActive ? 'Деактивировать' : 'Снова активное'}
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
