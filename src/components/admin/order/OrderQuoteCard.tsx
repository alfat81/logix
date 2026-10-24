'use client'

// ── Ж1: суть заявки — условия сделки (P1-19, показ; правка в
// OrderQuoteDialog, форма/чтение снимка — quote-snapshot.ts) ─────────
// Снимок выбранного варианта у конвертированной заявки или ручной ввод
// у заявки без лида.
import { useState } from 'react'
import { Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { QUOTE_PRIORITY_FIT_LABELS, type QuotePriorityFit } from '@/lib/leads'
import { formatMoney, formatMoneyWithVat } from '@/lib/money'
import type { QuoteSnapshot } from './types'
import { snapshotCurrency, snapshotPrice, snapshotVat } from './quote-snapshot'
import { OrderQuoteDialog } from './OrderQuoteDialog'

export function OrderQuoteCard({
  orderId,
  snapshot,
  onChanged,
}: {
  orderId: string
  snapshot: QuoteSnapshot
  onChanged: () => void
}) {
  const [quoteOpen, setQuoteOpen] = useState(false)

  const hasSnapshot = Boolean(
    snapshot &&
      (snapshot.description ||
        snapshotPrice(snapshot) != null ||
        snapshot.etaDays != null ||
        snapshot.priorityFit ||
        (Array.isArray(snapshot.transportModes) && snapshot.transportModes.length))
  )

  return (
    <>
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Условия сделки</CardTitle>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={() => setQuoteOpen(true)}
            title="Править условия сделки"
          >
            <Pencil className="size-4" />
          </Button>
        </CardHeader>
        <CardContent>
          {hasSnapshot && snapshot ? (
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <div className="min-w-52 flex-1">
                {snapshot.description && (
                  <div className="font-medium break-words">{snapshot.description}</div>
                )}
                <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-2 mt-1">
                  {Array.isArray(snapshot.transportModes) &&
                    snapshot.transportModes.length > 0 && (
                      <span className="flex gap-1">
                        {snapshot.transportModes.map((m) => (
                          <Badge key={m} variant="outline" className="text-xxs">
                            {m}
                          </Badge>
                        ))}
                      </span>
                    )}
                  {snapshot.etaDays != null && (
                    <span>срок: {snapshot.etaDays} дн.</span>
                  )}
                  {snapshot.priorityFit && (
                    <span>
                      · ориентир:{' '}
                      {QUOTE_PRIORITY_FIT_LABELS[snapshot.priorityFit as QuotePriorityFit] ??
                        snapshot.priorityFit}
                    </span>
                  )}
                </div>
              </div>
              {(() => {
                const p = snapshotPrice(snapshot)
                if (p === null) return null
                const cur = snapshotCurrency(snapshot)
                const vat = snapshotVat(snapshot)
                return (
                  <div className="font-semibold tabular-nums whitespace-nowrap">
                    {vat ? formatMoneyWithVat(p, cur, vat) : formatMoney(p, cur)}
                  </div>
                )
              })()}
            </div>
          ) : (
            <span className="text-muted-foreground text-sm">
              Условия не указаны — вариант расчёта не выбран или заявка создана вручную
            </span>
          )}
        </CardContent>
      </Card>

      <OrderQuoteDialog
        orderId={orderId}
        open={quoteOpen}
        onOpenChange={setQuoteOpen}
        snapshot={snapshot}
        onSaved={onChanged}
      />
    </>
  )
}
