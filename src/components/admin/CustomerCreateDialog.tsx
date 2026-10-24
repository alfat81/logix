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
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import { formatPhoneInput } from '@/lib/phone'

// v0.4.0: диалог создания клиента — выезд из CustomersList.tsx
// (резка под лимит 300, RULES 2.14 — как LeadCreateDialog/OrderCreate-
// Dialog). Логика 1:1: телефон нормализуется при вводе маской
// (formatPhoneInput), состояние живёт в диалоге.
export function CustomerCreateDialog({ onCreated }: { onCreated: () => void }) {
  const { toast } = useToast()

  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [comment, setComment] = useState('')

  const handleCreate = async () => {
    if (!name.trim()) {
      toast({ title: 'Укажите имя клиента', variant: 'destructive' })
      return
    }
    setCreating(true)
    try {
      const res = await fetch('/api/admin/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          phone: phone || null,
          email: email.trim() || null,
          comment: comment.trim() || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Не удалось создать клиента')

      toast({ title: `Клиент «${data.customer.name}» создан` })
      setOpen(false)
      setName('')
      setPhone('')
      setEmail('')
      setComment('')
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
          Новый клиент
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Новый клиент</DialogTitle>
          <DialogDescription>
            Завести заранее — например, перед первым обращением. Клиент
            также рождается сам при создании заявки или конвертации лида.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="cust-name">Имя или название</Label>
            <Input
              id="cust-name"
              placeholder="ООО «Ромашка» или Иван"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="cust-phone">Телефон</Label>
            <Input
              id="cust-phone"
              type="tel"
              placeholder="+7 (…) — не обязателен"
              value={phone}
              onChange={(e) => setPhone(formatPhoneInput(e.target.value))}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="cust-email">Email</Label>
            <Input
              id="cust-email"
              type="email"
              placeholder="не обязателен"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="cust-comment">Комментарий</Label>
            <Textarea
              id="cust-comment"
              placeholder="Например: возит из Китая, платит вовремя"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
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
