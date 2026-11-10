'use client'

// Поток A волна 1 (BL-1/BL-7): секция «Варианты расчёта» кабинета клиента —
// вынесена из ClientLeadCard (RULES 2.14, integrity IC-09). Продажные цены
// без себестоимости (сервер наружу её не отдаёт), кнопка «Согласовать этот
// вариант» с подтверждающим диалогом, после согласования — замок и
// зафиксированные условия из АКТИВНОГО снимка согласования (что клиент
// видел в момент согласия — то и отображается).
import { Loader2 } from 'lucide-react'
import { CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  LEAD_CONFIRM_VIA_LABELS,
  QUOTE_PRIORITY_FIT_LABELS,
  type LeadConfirmVia,
  type QuotePriorityFit,
} from '@/lib/leads'
import {
  formatMoneyWithVat,
  CURRENCIES,
  VAT_MODES,
  type CurrencyCode,
  type VatModeCode,
} from '@/lib/money'
import type { ClientOptionRow, ClientApprovalSnapshot } from './client-lead-types'

function moneyOf(price: string, currency: string, vatMode: string): string {
  const c: CurrencyCode = (CURRENCIES as readonly string[]).includes(currency)
    ? (currency as CurrencyCode)
    : 'RUB'
  const v: VatModeCode = (VAT_MODES as readonly string[]).includes(vatMode)
    ? (vatMode as VatModeCode)
    : 'WITHOUT_VAT'
  return formatMoneyWithVat(price, c, v)
}

export function ClientQuoteOptions({
  options,
  status,
  selectedOptionId,
  clientConfirmedAt,
  clientConfirmedVia,
  clientConfirmedByName,
  approvalSnapshot,
  canConfirm,
  confirming,
  confirmOption,
  onPickOption,
  onApprove,
}: {
  options: ClientOptionRow[]
  status: string
  selectedOptionId?: string | null
  clientConfirmedAt?: string | null
  clientConfirmedVia?: string | null
  clientConfirmedByName?: string | null
  approvalSnapshot?: ClientApprovalSnapshot | null
  canConfirm?: boolean
  confirming: boolean
  confirmOption: ClientOptionRow | null
  onPickOption: (o: ClientOptionRow | null) => void
  onApprove: (o: ClientOptionRow) => void
}) {
  if (options.length === 0) return null
  return (
    <>
      <Card className="p-0">
        <CardContent className="p-4 grid gap-3">
          <h2 className="text-base font-semibold">Варианты расчёта</h2>
          {status === 'client_approved' && clientConfirmedAt ? (
            <div className="rounded-md border border-success/50 bg-success/5 p-3 text-sm grid gap-1">
              <span className="flex items-center gap-2 font-medium">
                <CheckCircle2 className="size-4 text-success" />
                Согласовано {new Date(clientConfirmedAt).toLocaleString('ru-RU', { dateStyle: 'long', timeStyle: 'short' })}
              </span>
              <span className="text-muted-foreground">
                Способ: {clientConfirmedVia
                  ? LEAD_CONFIRM_VIA_LABELS[clientConfirmedVia as LeadConfirmVia] ?? clientConfirmedVia
                  : '—'}{clientConfirmedByName ? ` · ${clientConfirmedByName}` : ''}.
                Ожидает создания заявки менеджером. Изменить условия — через вашего менеджера.
              </span>
            </div>
          ) : null}
          <div className="grid gap-2">
            {options.map((o) => {
              const modes = Array.isArray(o.transportModes)
                ? o.transportModes.filter((m): m is string => typeof m === 'string')
                : []
              const isChosen = o.isSelected || selectedOptionId === o.id
              return (
                <div
                  key={o.id}
                  className={
                    isChosen
                      ? 'rounded-md border-2 border-action-icon p-3 grid gap-1'
                      : 'rounded-md border p-3 grid gap-1'
                  }
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{o.description}</span>
                    {isChosen && (
                      <Badge className="bg-primary text-primary-foreground border-transparent">
                        Выбран
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-2">
                    {modes.length > 0 &&
                      modes.map((m) => (
                        <Badge key={m} variant="outline" className="text-xs">
                          {m}
                        </Badge>
                      ))}
                    <span>срок: {o.etaDays} дн.</span>
                    <span>
                      · ориентир: {QUOTE_PRIORITY_FIT_LABELS[o.priorityFit as QuotePriorityFit] ?? o.priorityFit}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold tabular-nums">
                      {moneyOf(o.price, o.currency, o.vatMode)}
                    </span>
                    {canConfirm && !isChosen && (
                      <Button size="sm" onClick={() => onPickOption(o)}>
                        Согласовать этот вариант
                      </Button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
          {/* BL-7: зафиксированные условия — из активного снимка */}
          {status === 'client_approved' && approvalSnapshot ? (
            <div className="rounded-md border p-3 text-sm grid gap-1">
              <span className="font-medium">Зафиксированные условия</span>
              <span className="text-muted-foreground">
                {approvalSnapshot.description} · {moneyOf(approvalSnapshot.price, approvalSnapshot.currency, approvalSnapshot.vatMode)} ·{' '}
                {approvalSnapshot.etaDays} дн.
              </span>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* BL-1: подтверждающий диалог согласования варианта */}
      <Dialog open={!!confirmOption} onOpenChange={(open) => !open && onPickOption(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Согласовать вариант расчёта?</DialogTitle>
            <DialogDescription>
              Согласие означает принятие коммерческих условий варианта.
              Заявку создаст менеджер; дальнейшее изменение условий — через
              вашего менеджера.
            </DialogDescription>
          </DialogHeader>
          {confirmOption && (
            <div className="rounded-md border p-3 text-sm grid gap-1">
              <span className="font-medium">{confirmOption.description}</span>
              <span className="text-muted-foreground">
                {moneyOf(confirmOption.price, confirmOption.currency, confirmOption.vatMode)}{' '}
                · {confirmOption.etaDays} дн.
              </span>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => onPickOption(null)}>
              Отмена
            </Button>
            <Button onClick={() => confirmOption && onApprove(confirmOption)} disabled={confirming}>
              {confirming && <Loader2 className="size-4 animate-spin" />}
              <CheckCircle2 className="size-4" />
              Согласовать
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
