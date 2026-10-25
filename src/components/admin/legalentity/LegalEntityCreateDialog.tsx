'use client'

import { useState } from 'react'
import { Building2, Loader2 } from 'lucide-react'
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
import { RequisitesFields } from './RequisitesFields'
import { formToRequisites, type RequisitesFormState } from './types'

// v0.5.0 (P1-22): диалог создания юрлица — выезд из
// LegalEntitiesList.tsx (резка под лимит 300, RULES 2.14). Логика 1:1:
// реквизиты сохраняются только заполненные, лишние поля можно
// оставить пустыми.
export function LegalEntityCreateDialog({ onCreated }: { onCreated: () => void }) {
  const { toast } = useToast()

  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [requisites, setRequisites] = useState<RequisitesFormState>({})

  const handleCreate = async () => {
    if (!name.trim()) {
      toast({ title: 'Укажите название юрлица', variant: 'destructive' })
      return
    }
    setCreating(true)
    try {
      const res = await fetch('/api/admin/legal-entities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), requisites: formToRequisites(requisites) }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Не удалось создать юрлицо')

      toast({ title: `Юрлицо «${data.legalEntity.name}» создано` })
      setOpen(false)
      setName('')
      setRequisites({})
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
          <Building2 className="size-4" />
          Новое юрлицо
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md sm:max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Новое юрлицо</DialogTitle>
          <DialogDescription>
            Заполните реквизиты, которые нужны в документах. Структура свободная:
            лишние поля можно оставить пустыми — в базу уйдут только заполненные.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="le-name">Название</Label>
            <Input
              id="le-name"
              placeholder="ООО «Логикс»"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <RequisitesFields form={requisites} onChange={setRequisites} idPrefix="le-create" />
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
