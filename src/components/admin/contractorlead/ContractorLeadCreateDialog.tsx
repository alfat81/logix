'use client'

import { useState } from 'react'
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
import { readApiResponse } from '@/lib/api-client'
import { TransportChips } from './TransportChips'

// v0.5.0 (P1-22): диалог создания кандидата воронки — выезд из
// ContractorLeadsSection.tsx (резка под лимит 300, RULES 2.14).
// Логика 1:1: rawInfo — черновик, телефон не нормализуем (логин
// родится при переводе в пул — там сервер нормализует, Г2), пустые
// поля не отправляем вовсе.
export function ContractorLeadCreateDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: () => void
}) {
  const { toast } = useToast()

  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({
    companyName: '',
    contactPerson: '',
    phone: '',
    email: '',
    directions: '',
    transports: [] as string[],
  })

  const handleCreate = async () => {
    if (!form.companyName.trim()) {
      toast({ title: 'Укажите название компании', variant: 'destructive' })
      return
    }
    setCreating(true)
    try {
      const rawInfo: Record<string, unknown> = {}
      if (form.contactPerson.trim()) rawInfo.contactPerson = form.contactPerson.trim()
      if (form.phone.trim()) rawInfo.phone = form.phone.trim()
      if (form.email.trim()) rawInfo.email = form.email.trim()
      if (form.directions.trim()) rawInfo.directions = form.directions.trim()
      if (form.transports.length) rawInfo.transportTypes = form.transports

      const res = await fetch('/api/admin/contractor-leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName: form.companyName.trim(),
          ...(Object.keys(rawInfo).length ? { rawInfo } : {}),
        }),
      })
      const data = await readApiResponse<{ error?: string }>(res)
      if (!res.ok) throw new Error(data.error || 'Не удалось создать кандидата')
      toast({ title: 'Кандидат создан', description: 'Статус: Новый' })
      onOpenChange(false)
      setForm({ companyName: '', contactPerson: '', phone: '', email: '', directions: '', transports: [] })
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Новый кандидат</DialogTitle>
          <DialogDescription>
            Черновая анкета: кто, что возит, где работает. Подрядчик в справочнике родится
            сам при переводе в пул.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label>Компания</Label>
            <Input
              placeholder="Например: ООО Транзит-Лайн"
              value={form.companyName}
              onChange={(e) => setForm((f) => ({ ...f, companyName: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label className="text-xs text-muted-foreground">Контактное лицо</Label>
              <Input
                placeholder="Имя"
                value={form.contactPerson}
                onChange={(e) => setForm((f) => ({ ...f, contactPerson: e.target.value }))}
              />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs text-muted-foreground">Телефон</Label>
              <Input
                type="tel"
                placeholder="Можно с пробелами"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs text-muted-foreground">Email — не обязательно</Label>
              <Input
                type="email"
                placeholder="ops@company.ru"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs text-muted-foreground">Зоны работы</Label>
              <Input
                placeholder="Например: Китай — РФ, СНГ"
                value={form.directions}
                onChange={(e) => setForm((f) => ({ ...f, directions: e.target.value }))}
              />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground">Что возит (виды транспорта)</Label>
            <TransportChips
              selected={form.transports}
              onToggle={(v) =>
                setForm((f) => ({
                  ...f,
                  transports: f.transports.includes(v)
                    ? f.transports.filter((x) => x !== v)
                    : [...f.transports, v],
                }))
              }
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={handleCreate} disabled={creating}>
            {creating && <Loader2 className="size-4 animate-spin" />}
            Добавить кандидата
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
