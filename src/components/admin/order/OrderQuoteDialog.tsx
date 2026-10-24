'use client'

// Диалог правки условий сделки (P1-19: вынесен из OrderQuoteCard —
// RULES 2.14). Согласованный способ доставки: описание, транспорт,
// стоимость и срок. Пустая форма = снять условия (quoteSnapshot: null).
import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { readApiResponse } from '@/lib/api-client'
import { QUOTE_PRIORITY_FITS, QUOTE_PRIORITY_FIT_LABELS, TRANSPORT_TYPES } from '@/lib/leads'
import { CURRENCIES, CURRENCY_LABELS, VAT_MODES, VAT_MODE_LABELS, parseMoneyInput } from '@/lib/money'
import type { QuoteSnapshot } from './types'
import { EMPTY_QUOTE_FORM, quoteFormFromSnapshot, type QuoteForm } from './quote-snapshot'

export function OrderQuoteDialog({
  orderId,
  open,
  onOpenChange,
  snapshot,
  onSaved,
}: {
  orderId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  snapshot: QuoteSnapshot
  onSaved: () => void
}) {
  const { toast } = useToast()
  const [quoteForm, setQuoteForm] = useState<QuoteForm>({ ...EMPTY_QUOTE_FORM })
  const [savingQuote, setSavingQuote] = useState(false)

  // Предзаполнение из снимка при каждом открытии (замена — целиком)
  useEffect(() => {
    if (open) setQuoteForm(quoteFormFromSnapshot(snapshot ?? null))
  }, [open, snapshot])

  const saveQuote = async () => {
    const description = quoteForm.description.trim()
    const price = quoteForm.price.trim() ? parseMoneyInput(quoteForm.price) : null
    const eta = quoteForm.etaDays.trim() ? Number(quoteForm.etaDays.replace(',', '.')) : null
    if (quoteForm.price.trim() && price === null) {
      toast({
        title: 'Цена — число, больше нуля, до 2 знаков после запятой',
        variant: 'destructive',
      })
      return
    }
    if (eta !== null && (!Number.isInteger(eta) || eta <= 0)) {
      toast({ title: 'Срок — целое число дней, больше нуля', variant: 'destructive' })
      return
    }
    // Пустая форма = снять условия (quoteSnapshot: null); иначе —
    // собираем объект из заполненного, как buildLeadCargo у груза
    const snapshotPayload =
      description || price !== null || eta !== null || quoteForm.priorityFit || quoteForm.modes.length
        ? {
            ...(description ? { description } : {}),
            ...(quoteForm.modes.length ? { transportModes: quoteForm.modes } : {}),
            ...(price !== null
              ? { price, currency: quoteForm.currency, vatMode: quoteForm.vatMode }
              : {}),
            ...(eta !== null ? { etaDays: eta } : {}),
            ...(quoteForm.priorityFit ? { priorityFit: quoteForm.priorityFit } : {}),
          }
        : null
    setSavingQuote(true)
    try {
      const res = await fetch(`/api/admin/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quoteSnapshot: snapshotPayload }),
      })
      const data = await readApiResponse<{ message?: string; error?: string }>(res)
      if (!res.ok) {
        toast({ title: data.error || 'Ошибка', variant: 'destructive' })
        return
      }
      toast({ title: data.message || 'Обновлено' })
      onOpenChange(false)
      onSaved()
    } finally {
      setSavingQuote(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Условия сделки</DialogTitle>
          <DialogDescription>
            Согласованный способ доставки: описание, транспорт,
            стоимость и срок. У конвертированной заявки — снимок
            выбранного варианта расчёта лида.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="snap-desc">Описание</Label>
            <Textarea
              id="snap-desc"
              rows={2}
              placeholder="Например: Авиа Пекин → Шереметьево, прямой рейс"
              value={quoteForm.description}
              onChange={(e) => setQuoteForm((f) => ({ ...f, description: e.target.value }))}
            />
          </div>
          <div className="grid gap-2">
            <Label>Виды транспорта</Label>
            <div className="flex flex-wrap gap-2">
              {TRANSPORT_TYPES.map((t) => {
                const active = quoteForm.modes.includes(t)
                return (
                  <Button
                    key={t}
                    type="button"
                    size="sm"
                    variant={active ? 'default' : 'outline'}
                    onClick={() =>
                      setQuoteForm((f) => ({
                        ...f,
                        modes: active ? f.modes.filter((m) => m !== t) : [...f.modes, t],
                      }))
                    }
                  >
                    {t}
                  </Button>
                )
              })}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="snap-price">Цена клиенту</Label>
              <Input
                id="snap-price"
                inputMode="decimal"
                placeholder="150000"
                value={quoteForm.price}
                onChange={(e) =>
                  setQuoteForm((f) => ({ ...f, price: e.target.value }))
                }
              />
            </div>
            <div className="grid gap-2">
              <Label>Валюта</Label>
              <Select
                value={quoteForm.currency}
                onValueChange={(v) => setQuoteForm((f) => ({ ...f, currency: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {CURRENCY_LABELS[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>НДС</Label>
              <Select
                value={quoteForm.vatMode}
                onValueChange={(v) => setQuoteForm((f) => ({ ...f, vatMode: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VAT_MODES.map((v) => (
                    <SelectItem key={v} value={v}>
                      {VAT_MODE_LABELS[v]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="snap-eta">Срок, дней</Label>
              <Input
                id="snap-eta"
                inputMode="numeric"
                placeholder="12"
                value={quoteForm.etaDays}
                onChange={(e) => setQuoteForm((f) => ({ ...f, etaDays: e.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <Label>Ориентир</Label>
              <Select
                value={quoteForm.priorityFit || 'none'}
                onValueChange={(v) =>
                  setQuoteForm((f) => ({ ...f, priorityFit: v === 'none' ? '' : v }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {QUOTE_PRIORITY_FITS.map((p) => (
                    <SelectItem key={p} value={p}>
                      {QUOTE_PRIORITY_FIT_LABELS[p]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button onClick={saveQuote} disabled={savingQuote}>
            {savingQuote && <Loader2 className="size-4 animate-spin" />}
            Сохранить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
