'use client'

import { useEffect, useState } from 'react'
import { Loader2, Plus, Users } from 'lucide-react'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { readApiResponse } from '@/lib/api-client'
import { CargoFormFields } from '@/components/admin/CargoGroups'
import { EMPTY_LEAD_CARGO_FORM, buildLeadPayload, type LeadCargoForm } from '@/lib/leads'

type CustomerRow = { id: string; name: string; phone: string | null }

// v0.4.0: диалог создания лида — выезд из LeadsList.tsx (резка под
// лимит 300, RULES 2.14 — как OrderCreateDialog в v0.3.1). Логика 1:1:
// клиент — из справочника либо сырые контакты (В1/В2: лид рождается
// до заведения клиента), анкета груза — общий бланк CargoFormFields
// (В5, та же форма, что у заявки); состояние живёт в диалоге.
export function LeadCreateDialog({ onCreated }: { onCreated: () => void }) {
  const { toast } = useToast()

  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [customers, setCustomers] = useState<CustomerRow[]>([])

  // Клиентская часть: либо существующий (customerId), либо сырые
  // контакты rawContact (В1/В2).
  const [isNewContact, setIsNewContact] = useState(true)
  const [customerId, setCustomerId] = useState('')
  const [contactName, setContactName] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  // Анкета груза — поля типового бланка заявки (В5).
  const [cargo, setCargo] = useState<LeadCargoForm>({ ...EMPTY_LEAD_CARGO_FORM })

  // Справочник клиентов — один раз при первом открытии диалога
  useEffect(() => {
    if (!open || customers.length) return
    fetch('/api/admin/customers')
      .then((r) => r.json())
      .then((d) => setCustomers(d.customers ?? []))
      .catch(() => {})
  }, [open, customers.length])

  const resetForm = () => {
    setCustomerId('')
    setContactName('')
    setContactPhone('')
    setContactEmail('')
    setIsNewContact(true)
    setCargo({ ...EMPTY_LEAD_CARGO_FORM })
  }

  const handleCreate = async () => {
    if (isNewContact && !contactName.trim()) {
      toast({ title: 'Укажите имя контакта', variant: 'destructive' })
      return
    }
    if (!isNewContact && !customerId) {
      toast({ title: 'Выберите клиента из справочника', variant: 'destructive' })
      return
    }
    setCreating(true)
    try {
      // rawContact — черновик: телефон не нормализуем (бывают
      // иностранные +86…, В1), пустые email не отправляем вовсе
      // (серверная zod-схема проверит формат непустого).
      const raw = isNewContact
        ? {
            name: contactName.trim(),
            ...(contactPhone.trim() ? { phone: contactPhone.trim() } : {}),
            ...(contactEmail.trim() ? { email: contactEmail.trim() } : {}),
          }
        : undefined
      // P1-03: форма → route (колонки) + cargoInfo-rest
      const { route, cargo: cargoInfo } = buildLeadPayload(cargo)

      const res = await fetch('/api/admin/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(isNewContact ? { rawContact: raw } : { customerId }),
          ...(cargoInfo ? { cargoInfo } : {}),
          route,
        }),
      })
      const data = await readApiResponse<{ error?: string }>(res)
      if (!res.ok) throw new Error(data.error || 'Не удалось создать лид')

      toast({ title: 'Лид создан', description: 'Статус: Новый' })
      setOpen(false)
      resetForm()
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
          <Plus className="size-4" />
          Новый лид
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Новый лид</DialogTitle>
          <DialogDescription>
            Анкета — по типовой заявке клиента: заполняйте по мере наличия
            данных, все поля груза необязательны. Клиент в справочнике
            родится сам при конвертации в заявку.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-5">
          {/* ── Клиент / контакты ─────────────────────────── */}
          <div className="grid gap-2">
            <Label>Клиент</Label>
            {isNewContact ? (
              <div className="grid gap-2">
                <div className="flex gap-2">
                  <Input
                    placeholder="Контактное лицо или компания"
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                  />
                  <Button type="button" variant="outline" onClick={() => setIsNewContact(false)}>
                    Из списка
                  </Button>
                </div>
                <Input
                  type="tel"
                  placeholder="Телефон — не обязателен (можно иностранный)"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                />
                <Input
                  type="email"
                  placeholder="Email — не обязателен"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                />
              </div>
            ) : (
              <div className="flex gap-2">
                <Select value={customerId} onValueChange={setCustomerId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Выберите клиента" />
                  </SelectTrigger>
                  <SelectContent>
                    <div className="max-h-64 overflow-y-auto">
                      {customers.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                          {c.phone ? ` · ${c.phone}` : ''}
                        </SelectItem>
                      ))}
                    </div>
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsNewContact(true)
                    setCustomerId('')
                  }}
                >
                  <Users className="size-4" />
                  Новый
                </Button>
              </div>
            )}
          </div>

          {/* ── Анкета груза: общий бланк (CargoFormFields, Ж1 —
              та же форма правки груза у заявки) ───────────── */}
          <CargoFormFields form={cargo} onChange={setCargo} />
        </div>
        <DialogFooter>
          <Button onClick={handleCreate} disabled={creating}>
            {creating && <Loader2 className="size-4 animate-spin" />}
            Создать лид
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
