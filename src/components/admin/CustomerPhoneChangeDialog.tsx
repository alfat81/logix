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
import { readApiResponse } from '@/lib/api-client'
import { isPhoneNormalized } from '@/lib/phone'
import type { CustomerUserRow } from './CustomerUserDialog'

// ─── BL-8: диалог смены телефона пользователя компании (DF-25) ───────
// Двухшаговая операция (план ред. 3 §5.2): шаг 1 — новый номер →
// сервер выдаёт одноразовый код (TTL 15 мин, лимит 5 попыток); шаг 2 —
// ввод кода → атомарное подтверждение. Ручной режим доставки
// (manual_by_manager): шлюза WhatsApp/SMS нет (P2-01), код показывается
// менеджеру с инструкцией передать клиенту; при появлении шлюза
// показ кода уйдёт без изменения логики диалога (поле читается только
// при delivery='manual_by_manager').
//
// Пока смена не подтверждена — старый телефон продолжает работать
// (вход не прерывается); повторный запрос кода перезаписывает старый.

function fmtExpires(iso: string): string {
  return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
}

export function CustomerPhoneChangeDialog({
  customerId,
  target,
  open,
  onClose,
  onChanged,
}: {
  customerId: string
  target: CustomerUserRow | null
  open: boolean
  onClose: () => void
  onChanged: () => void
}) {
  const { toast } = useToast()
  const [newPhone, setNewPhone] = useState('')
  const [code, setCode] = useState('')
  const [issued, setIssued] = useState<{ code?: string; expiresAt: string } | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) {
      setNewPhone('')
      setCode('')
      setIssued(null)
    }
  }, [open, target])

  if (!target) return null

  const start = async () => {
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/customers/${customerId}/access/phone-change`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: target.id, newPhone: newPhone.trim() }),
      })
      const data = await readApiResponse<{ code?: string; expiresAt?: string; error?: string }>(res)
      if (!res.ok) throw new Error(data.error || 'Не удалось выдать код')
      setIssued({ code: data.code, expiresAt: data.expiresAt ?? '' })
      toast({
        title: 'Код выдан',
        description: data.code
          ? 'Ручной режим: сообщите код клиенту по телефону или в мессенджере'
          : undefined,
      })
    } catch (e) {
      toast({
        title: 'Ошибка',
        description: e instanceof Error ? e.message : '',
        variant: 'destructive',
      })
    } finally {
      setBusy(false)
    }
  }

  const confirm = async () => {
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/customers/${customerId}/access/phone-confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: target.id, code: code.trim() }),
      })
      const data = await readApiResponse<{ phone?: string; error?: string }>(res)
      if (!res.ok) throw new Error(data.error || 'Код не принят')
      toast({ title: `Телефон изменён на ${data.phone}` })
      onChanged()
      onClose()
    } catch (e) {
      toast({
        title: 'Код не принят',
        description: e instanceof Error ? e.message : '',
        variant: 'destructive',
      })
    } finally {
      setBusy(false)
    }
  }

  const phoneHint = newPhone.trim() && !isPhoneNormalized(newPhone.trim())
    ? 'Номер не приводится к +7… — сервер отклонит его'
    : 'Логин в кабинет — нормализованный российский номер'

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Изменить телефон — {target.name}</DialogTitle>
          <DialogDescription>
            Текущий логин: <span className="font-mono">{target.phone ?? '—'}</span>. Старый вход
            работает до подтверждения кода; после подтверждения клиент входит по новому номеру.
          </DialogDescription>
        </DialogHeader>

        {!issued ? (
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="pc-new-phone">Новый телефон (логин)</Label>
              <Input
                id="pc-new-phone"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                placeholder="+79001234567"
                className="font-mono"
                disabled={busy}
              />
              <p className="text-xs text-muted-foreground">{phoneHint}</p>
            </div>
            <DialogFooter>
              <Button onClick={start} disabled={busy || !newPhone.trim()}>
                {busy && <Loader2 className="size-4 animate-spin" />}
                Выдать код
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="grid gap-3">
            {issued.code && (
              <div className="rounded-lg border p-3 grid gap-1">
                <p className="text-sm font-medium">
                  Код (ручной режим — действует до {issued.expiresAt && fmtExpires(issued.expiresAt)}):
                </p>
                <p className="font-mono text-2xl tracking-widest">{issued.code}</p>
                <p className="text-xs text-muted-foreground">
                  Шлюза WhatsApp/SMS нет — сообщите код клиенту по телефону или в мессенджере, затем
                  введите его здесь (лимит попыток — 5).
                </p>
              </div>
            )}
            <div className="grid gap-1.5">
              <Label htmlFor="pc-code">Код из 6 цифр</Label>
              <Input
                id="pc-code"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                placeholder="000000"
                maxLength={6}
                className="font-mono"
                inputMode="numeric"
                disabled={busy}
              />
            </div>
            <DialogFooter className="sm:justify-between">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIssued(null)}
                disabled={busy}
              >
                Другой номер
              </Button>
              <Button onClick={confirm} disabled={busy || code.length !== 6}>
                {busy && <Loader2 className="size-4 animate-spin" />}
                Подтвердить
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
