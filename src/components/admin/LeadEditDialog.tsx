'use client'

// ─── P1-02: диалог правки анкеты лида (контакты + груз) ────────────
// Открывается из карточки лида (кнопка «Править анкету», окно
// new/calculated). Груз — общий бланк CargoFormFields (Ж1: один бланк
// — одно место правки); контакты — только у лида БЕЗ клиента: у
// связанного клиента контакты живут в справочнике Customer (P1-07),
// в анкете их править не даём. Сохранение — PATCH лида; журнал
// пополняется diff'ом на сервере (приёмка P1-02: «Вес: 1 200 → 1 450»).

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
import { readApiResponse } from '@/lib/api-client'
import { CargoFormFields } from '@/components/admin/CargoGroups'
import {
  EMPTY_LEAD_CARGO_FORM,
  buildLeadPayload,
  cargoFormFromData,
  type LeadCargoForm,
  type RawContact,
} from '@/lib/leads'

type ContactForm = { name: string; phone: string; email: string }

const EMPTY_CONTACT: ContactForm = { name: '', phone: '', email: '' }

export function LeadEditDialog({
  open,
  onOpenChange,
  leadId,
  hasCustomer,
  initialContact,
  initialRow,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  leadId: string
  hasCustomer: boolean
  initialContact: RawContact | null
  initialRow: Record<string, unknown>
  onSaved: () => void
}) {
  const { toast } = useToast()
  const [contact, setContact] = useState<ContactForm>({ ...EMPTY_CONTACT })
  const [cargo, setCargo] = useState<LeadCargoForm>({ ...EMPTY_LEAD_CARGO_FORM })
  const [saving, setSaving] = useState(false)

  // Инициализация при каждом открытии — из актуальных данных лида
  // (load() карточки обновляет пропсы, форма не застаётся).
  useEffect(() => {
    if (!open) return
    setContact(
      initialContact
        ? { name: initialContact.name, phone: initialContact.phone ?? '', email: initialContact.email ?? '' }
        : { ...EMPTY_CONTACT }
    )
    // P1-03: форма — из колонок маршрута + cargoInfo-rest лида
    setCargo(cargoFormFromData(initialRow))
  }, [open, initialContact, initialRow])

  const save = async () => {
    if (!hasCustomer && !contact.name.trim()) {
      toast({ title: 'Укажите имя контакта', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      const body: Record<string, unknown> = {
        // P1-03: форма → route (колонки) + cargoInfo-rest. Груз отправляем
        // всегда: пустые поля очищают (null), неизвестные ключи старого
        // Json сервер сохранит, diff уйдёт в журнал.
        ...buildLeadPayload(cargo),
      }
      if (!hasCustomer) {
        body.rawContact = {
          name: contact.name.trim(),
          ...(contact.phone.trim() ? { phone: contact.phone.trim() } : {}),
          ...(contact.email.trim() ? { email: contact.email.trim() } : {}),
        }
      }
      const res = await fetch(`/api/admin/leads/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await readApiResponse<{ message?: string; error?: string }>(res)
      if (!res.ok) throw new Error(data.error || 'Не удалось сохранить анкету')
      toast({ title: data.message || 'Анкета обновлена' })
      onOpenChange(false)
      onSaved()
    } catch (e) {
      toast({
        title: 'Ошибка',
        description: e instanceof Error ? e.message : '',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Правка анкеты запроса</DialogTitle>
          <DialogDescription>
            {hasCustomer
              ? 'Контакты привязаны к клиенту из справочника — правится только анкета груза. Все изменения попадут в журнал запроса.'
              : 'Контакты и анкета груза. Все изменения попадут в журнал запроса.'}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-5">
          {!hasCustomer && (
            <div className="grid gap-3">
              <div className="text-sm font-medium">Контакты</div>
              <div className="grid grid-cols-3 gap-3">
                <div className="grid gap-1.5">
                  <Label className="text-xs text-muted-foreground">Имя</Label>
                  <Input
                    placeholder="Например: Евгений"
                    value={contact.name}
                    onChange={(e) => setContact((c) => ({ ...c, name: e.target.value }))}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs text-muted-foreground">Телефон</Label>
                  <Input
                    placeholder="+7… или +86…"
                    value={contact.phone}
                    onChange={(e) => setContact((c) => ({ ...c, phone: e.target.value }))}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs text-muted-foreground">Email</Label>
                  <Input
                    type="email"
                    placeholder="mail@example.com"
                    value={contact.email}
                    onChange={(e) => setContact((c) => ({ ...c, email: e.target.value }))}
                  />
                </div>
              </div>
            </div>
          )}
          <CargoFormFields form={cargo} onChange={setCargo} />
        </div>
        <DialogFooter>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            Сохранить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
