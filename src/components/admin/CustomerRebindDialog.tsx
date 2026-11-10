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
import type { CustomerUserRow } from './CustomerUserDialog'

// ─── BL-9: диалог перепривязки пользователя к другой компании ────────
// Отдельная операция (план ред. 3 §5.3; А5 — телефон и компания —
// разные операции). Не-primary, целевая компания активна. Подтверждающий
// текст честен: пользователь теряет доступ к данным прежней компании,
// история прежней компании сохраняется (события с actorName-снимком,
// лиды/заявки/документы остаются). Живые сеансы гасятся немедленно.
// Видимость по построению: кабинетские роуты скоупятся от customerId.

type CustomerOption = { id: string; name: string; isActive: boolean }

export function CustomerRebindDialog({
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
  const [options, setOptions] = useState<CustomerOption[] | null>(null)
  const [chosen, setChosen] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setChosen('')
    setOptions(null)
    ;(async () => {
      try {
        const res = await fetch(`/api/admin/customers?take=200`)
        const data = await readApiResponse<{ customers?: CustomerOption[]; error?: string }>(res)
        if (!res.ok) throw new Error(data.error || 'Ошибка загрузки компаний')
        // Текущая компания в списке не нужна; неактивная помечена
        const list = (data.customers ?? []).filter((c) => c.id !== customerId)
        setOptions(list)
      } catch (e) {
        toast({
          title: 'Не удалось загрузить справочник компаний',
          description: e instanceof Error ? e.message : '',
          variant: 'destructive',
        })
        setOptions([])
      }
    })()
  }, [open, customerId, toast])

  if (!target) return null

  const chosenName = options?.find((c) => c.id === chosen)?.name

  const submit = async () => {
    if (!chosen) return
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/customers/${customerId}/access/rebind`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: target.id, targetCustomerId: chosen }),
      })
      const data = await readApiResponse<{ error?: string }>(res)
      if (!res.ok) throw new Error(data.error || 'Не удалось перепривязать')
      toast({ title: `Пользователь перепривязан к «${chosenName}» — его сеансы завершены` })
      onChanged()
      onClose()
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

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Перепривязать пользователя — {target.name}</DialogTitle>
          <DialogDescription>
            Перепривязка — отдельная операция, не связанная со сменой телефона. Логин (телефон)
            сохраняется: <span className="font-mono">{target.phone ?? '—'}</span>
            {target.isPrimary ? '; основной пользователь не перепривязывается' : ''}.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <label htmlFor="rb-target" className="text-sm font-medium">
              Целевая компания
            </label>
            {options === null ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                <Loader2 className="size-4 animate-spin" />
                Загрузка…
              </div>
            ) : options.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Других компаний в справочнике нет — перепривязывать некуда.
              </p>
            ) : (
              <select
                id="rb-target"
                value={chosen}
                onChange={(e) => setChosen(e.target.value)}
                disabled={busy}
                className="border rounded-md px-3 py-2 text-sm bg-background"
              >
                <option value="">Выберите компанию…</option>
                {options.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {!c.isActive && ' (деактивирована — доступ закрыт)'}
                  </option>
                ))}
              </select>
            )}
          </div>
          {chosen && (
            <p className="rounded-lg border p-3 text-sm">
              Пользователь потеряет доступ к данным текущей компании; история прежней компании
              сохранится, активные сеансы будут завершены. В «{chosenName}» он появится в списке
              доступа как обычный пользователь.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={busy || !chosen}>
            {busy && <Loader2 className="size-4 animate-spin" />}
            Перепривязать
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
