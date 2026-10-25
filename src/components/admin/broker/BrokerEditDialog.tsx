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
import { useToast } from '@/hooks/use-toast'
import { readApiResponse } from '@/lib/api-client'
import { BrokerFormFields } from './BrokerFormFields'
import { EMPTY_BROKER_FORM, type BrokerForm, type BrokerRow } from './types'

// v0.5.0 (P1-22): диалог правки брокера — выезд из BrokersList.tsx
// (резка под лимит 300, RULES 2.14). Логика 1:1: телефон шлём как есть
// (сырой — сервер откажёт 400 с подсказкой), пустой пароль — не меняем
// вовсе; деактивация — отдельное действие карточки, здесь только поля.
export function BrokerEditDialog({
  broker,
  onClose,
  onSaved,
}: {
  broker: BrokerRow | null
  onClose: () => void
  onSaved: () => void
}) {
  const { toast } = useToast()

  const [form, setForm] = useState<BrokerForm>({ ...EMPTY_BROKER_FORM })
  const [saving, setSaving] = useState(false)

  // Форма наполняется заново при каждом открытии (broker изменился)
  useEffect(() => {
    if (broker) {
      setForm({
        companyName: broker.companyName,
        phone: broker.phone,
        password: '',
        isInHouse: broker.isInHouse,
        comment: broker.comment ?? '',
      })
    }
  }, [broker])

  const save = async () => {
    if (!broker) return
    const companyName = form.companyName.trim()
    if (!companyName) {
      toast({ title: 'Укажите название компании', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      const body: Record<string, unknown> = {
        companyName,
        isInHouse: form.isInHouse,
        comment: form.comment.trim() || null,
      }
      if (form.phone.trim() && form.phone.trim() !== broker.phone) {
        body.phone = form.phone.trim()
      }
      if (form.password) {
        body.password = form.password
      }
      const res = await fetch(`/api/admin/brokers/${broker.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await readApiResponse<{ message?: string; error?: string }>(res)
      if (!res.ok) throw new Error(data.error || 'Не удалось обновить брокера')
      toast({ title: data.message || 'Брокер обновлён' })
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
    <Dialog open={broker !== null} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Править брокера</DialogTitle>
          <DialogDescription>
            Телефон — логин портала (нормализация и занятость — на сервере).
            Смена пароля закрывает действующие входы. Пустое поле пароля —
            пароль не меняется.
          </DialogDescription>
        </DialogHeader>
        <BrokerFormFields
          form={form}
          onChange={setForm}
          disabled={saving}
          idPrefix="eb"
          passwordPlaceholder="не меняется"
        />
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Отмена
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            Сохранить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
