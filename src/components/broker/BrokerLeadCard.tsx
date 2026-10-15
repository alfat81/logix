'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowRight, Loader2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import { readApiResponse } from '@/lib/api-client'
import { CargoGroups } from '@/components/admin/CargoGroups'
import { BrokerLeadStatusBadge } from '@/components/broker/BrokerBadges'
import { BrokerEstimateForm, type BrokerEstimate } from '@/components/broker/BrokerEstimateForm'
import type { LeadStatus } from '@/lib/leads'

// ─── Карточка расчёта для брокера (Д) ──────────────────────────────
// Анкета груза (общий бланк заявки — тот же компонент CargoGroups,
// доменная форма документа, не «хром» админки, тот же приём что в
// ClientHome И1) + форма оценки таможенных платежей. Всё остальное
// (варианты и цены, контакты клиента, другие брокеры) — за периметром
// видимости брокера (решение по образцу вопроса №1 от 14.10.2026).

type BrokerLead = {
  id: string
  status: LeadStatus
  createdAt: string
  cargoInfo: Record<string, unknown> | null
  customerName: string | null
  order: { id: string; number: string } | null
  estimate: BrokerEstimate | null
}

const fmtDate = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleDateString('ru-RU') : '—'

export function BrokerLeadCard() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { toast } = useToast()

  const [lead, setLead] = useState<BrokerLead | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/broker/leads/${id}`)
      if (res.status === 404) {
        toast({ title: 'Запрос не найден', variant: 'destructive' })
        router.replace('/broker')
        return
      }
      const data = await readApiResponse<{ lead: BrokerLead; error?: string }>(res)
      if (!res.ok) throw new Error(data.error || 'Ошибка загрузки')
      setLead(data.lead)
    } catch (e) {
      toast({
        title: 'Не удалось загрузить запрос',
        description: e instanceof Error ? e.message : '',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }, [id, router, toast])

  useEffect(() => {
    load()
  }, [load])

  if (loading || !lead) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground text-sm py-16 justify-center">
        <Loader2 className="size-4 animate-spin" />
        Загрузка…
      </div>
    )
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">
          Запрос на расчёт от {fmtDate(lead.createdAt)}
        </h1>
        <BrokerLeadStatusBadge status={lead.status} />
      </div>

      {/* Сделка уехала в исполнение — расчёт живёт теперь карточкой
          заявки (та же видимость через OrderBroker, роадмап 5а) */}
      {lead.order && (
        <Card className="p-4 flex flex-wrap items-center gap-4 border-success/50 bg-success/5">
          <div className="flex-1">
            <div className="font-medium">Сконвертирован в заявку {lead.order.number}</div>
            <div className="text-sm text-muted-foreground">
              Расчёт завершён — оценку можно уточнять на карточке заявки
            </div>
          </div>
          <Button variant="outline" asChild>
            <Link href={`/broker/orders/${lead.order.id}`}>
              Заявка {lead.order.number}
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            Анкета груза
            {lead.customerName ? (
              <span className="text-muted-foreground font-normal"> · {lead.customerName}</span>
            ) : null}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <CargoGroups
            cargoInfo={lead.cargoInfo}
            emptyText="Анкета не заполнена — запросите данные у менеджера"
          />
        </CardContent>
      </Card>

      <BrokerEstimateForm leadId={lead.id} estimate={lead.estimate} onSaved={load} />
    </div>
  )
}
