'use client'

import { useState } from 'react'
import { Loader2, Plus } from 'lucide-react'
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
import { useToast } from '@/hooks/use-toast'
import { readApiResponse } from '@/lib/api-client'
import { normalizePhone } from '@/lib/phone'
import { BROKER_PASSWORD_MIN } from '@/lib/brokers'
import { BrokerFormFields } from './BrokerFormFields'
import { EMPTY_BROKER_FORM, type BrokerForm } from './types'

// v0.5.0 (P1-22): диалог создания брокера — выезд из BrokersList.tsx
// (резка под лимит 300, RULES 2.14). Логика 1:1: телефон нормализуется
// при отправке (normalizePhone), состояние живёт в диалоге.
export function BrokerCreateDialog({ onCreated }: { onCreated: () => void }) {
  const { toast } = useToast()

  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<BrokerForm>({ ...EMPTY_BROKER_FORM })
  const [creating, setCreating] = useState(false)

  const create = async () => {
    const companyName = form.companyName.trim()
    const phone = normalizePhone(form.phone)
    if (!companyName || !phone || !form.password) {
      toast({ title: 'Заполните название, телефон и пароль', variant: 'destructive' })
      return
    }
    setCreating(true)
    try {
      const res = await fetch('/api/admin/brokers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName,
          phone,
          // DF-02: email необязателен; пустое поле не отправляем (null в БД)
          ...(form.email.trim() ? { email: form.email.trim() } : {}),
          password: form.password,
          isInHouse: form.isInHouse,
          ...(form.comment.trim() ? { comment: form.comment.trim() } : {}),
        }),
      })
      const data = await readApiResponse<{ error?: string }>(res)
      if (!res.ok) throw new Error(data.error || 'Не удалось создать брокера')
      toast({
        title: 'Брокер создан',
        description: 'Передайте логин и пароль представителю брокера',
      })
      setOpen(false)
      setForm({ ...EMPTY_BROKER_FORM })
      onCreated()
    } catch (e) {
      toast({
        title: 'Ошибка',
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
          Добавить брокера
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Новый брокер</DialogTitle>
          <DialogDescription>
            Таможенный представитель, привлечённый на сделки. Телефон —
            логин портала (нормализуется сервером), пароль не короче{' '}
            {BROKER_PASSWORD_MIN} символов — передайте его представителю
            брокера лично.
          </DialogDescription>
        </DialogHeader>
        <BrokerFormFields
          form={form}
          onChange={setForm}
          disabled={creating}
          idPrefix="br"
          passwordPlaceholder={`минимум ${BROKER_PASSWORD_MIN} символов`}
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={creating}>
            Отмена
          </Button>
          <Button onClick={create} disabled={creating}>
            {creating && <Loader2 className="size-4 animate-spin" />}
            Создать
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
