'use client'

import Link from 'next/link'
import { ArrowRight, FileText } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { formatMoney } from '@/lib/money'
import { clientLeadRouteOf, type ClientLeadRowData } from '@/components/client/ClientLeadRow'

// TU-01.7 (волна 3): «Актуальные предложения» Обзора (референс
// clientcabinet.png) — запросы в статусе «рассчитан»: менеджер
// предложил варианты стоимости, решение за клиентом. «Сравнить»
// ведёт в карточку запроса (существующие Quote Options, Р-1).
// Сводка (количество вариантов, «от …», срок) — реальные данные
// из offerSummary API (цена клиентская, P1-04); демо-строки макета
// (REQ-14-5) не переносятся — у лида нет номера, карточки открываются
// из списков (реестр отклонений).
export type OfferSummary = {
  leadId: string
  count: number
  fromPrice: string | null
  currency: string | null
  minEtaDays: number | null
}

// Русская плюрализация: 1 вариант / 2 варианта / 5 вариантов
const variantWord = (n: number): string =>
  n % 10 === 1 && n % 100 !== 11 ? 'вариант' : [2, 3, 4].includes(n % 10) && !(n % 100 >= 12 && n % 100 <= 14) ? 'варианта' : 'вариантов'

export function ClientOffers({
  leads,
  summary,
}: {
  leads: ClientLeadRowData[]
  summary: OfferSummary[]
}) {
  if (leads.length === 0) return null

  const byId = new Map(summary.map((s) => [s.leadId, s]))

  return (
    <section className="grid gap-3" aria-labelledby="offers-title">
      <h2 id="offers-title" className="text-lg font-semibold tracking-tight">
        Актуальные предложения
      </h2>
      <div className="grid gap-3">
        {leads.map((lead) => {
          const r = clientLeadRouteOf(lead)
          const s = byId.get(lead.id)
          return (
            <Card key={lead.id} className="p-0">
              <CardContent className="p-4 flex flex-wrap items-center gap-x-4 gap-y-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent-text">
                  <FileText className="size-5" />
                </span>
                <div className="min-w-48 flex-1">
                  <div className="text-sm font-semibold">
                    Перевозка: {r.from || '—'} → {r.to || '—'}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {s?.count ? `${s.count} ${variantWord(s.count)} стоимости предложено` : 'Варианты стоимости предложены'}
                    {s?.minEtaDays != null && <> · срок: от {s.minEtaDays} дн.</>}
                  </div>
                </div>
                {s?.fromPrice != null && s?.currency && (
                  <div className="text-right whitespace-nowrap">
                    <div className="text-xs uppercase tracking-widest text-muted-foreground">от</div>
                    <div className="text-lg font-bold text-accent-text">
                      {formatMoney(s.fromPrice, s.currency)}
                    </div>
                  </div>
                )}
                <Button asChild className="ml-auto">
                  <Link href={`/client/leads/${lead.id}`}>
                    Сравнить
                    <ArrowRight className="size-4" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </section>
  )
}
