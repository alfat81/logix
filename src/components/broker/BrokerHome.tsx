'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'
import { readApiResponse } from '@/lib/api-client'
import { BrokerSummaryCards } from '@/components/broker/overview/BrokerSummaryCards'
import { BrokerQueue } from '@/components/broker/overview/BrokerQueue'
import {
  buildQueue,
  queueCounters,
  type BrokerLeadRow,
  type BrokerOrderRow,
  type BrokerQueueRow,
} from '@/components/broker/overview/queue'

// ─── Главная портала брокера (TU-01.8, волна 4) ─────────────────────
// Референс brockercabinet.png: заголовок «Таможенные расчёты», сводные
// карточки на реальных счётчиках, единая очередь расчётов (запросы +
// заявки, вкладки «Активные / Архив», поиск), блок «Контроль точности» —
// действующее правило Р-3/Р-5: полная история расчётов у брокера и
// менеджера, клиент видит только актуальный результат. Данные тянутся
// из существующих API портала (контракты не менялись); демо-данные и
// фиктивные действия макета не переносятся (Д-22…Д-24). Полномочия
// брокера без изменений.

export function BrokerHome() {
  const { toast } = useToast()

  const [orders, setOrders] = useState<BrokerOrderRow[] | null>(null)
  const [leads, setLeads] = useState<BrokerLeadRow[] | null>(null)

  const loadOrders = useCallback(async () => {
    try {
      const res = await fetch('/api/broker/orders')
      const data = await readApiResponse<{ orders?: BrokerOrderRow[]; error?: string }>(res)
      if (!res.ok) throw new Error(data.error || 'Ошибка загрузки')
      setOrders(data.orders ?? [])
    } catch (e) {
      toast({
        title: 'Не удалось загрузить заявки',
        description: e instanceof Error ? e.message : '',
        variant: 'destructive',
      })
      setOrders([])
    }
  }, [toast])

  const loadLeads = useCallback(async () => {
    try {
      const res = await fetch('/api/broker/leads')
      const data = await readApiResponse<{ leads?: BrokerLeadRow[]; error?: string }>(res)
      if (!res.ok) throw new Error(data.error || 'Ошибка загрузки')
      setLeads(data.leads ?? [])
    } catch (e) {
      toast({
        title: 'Не удалось загрузить запросы',
        description: e instanceof Error ? e.message : '',
        variant: 'destructive',
      })
      setLeads([])
    }
  }, [toast])

  useEffect(() => {
    loadOrders()
    loadLeads()
  }, [loadOrders, loadLeads])

  const rows: BrokerQueueRow[] = useMemo(
    () => buildQueue(orders ?? [], leads ?? []),
    [orders, leads]
  )
  const counters = useMemo(() => queueCounters(rows), [rows])
  const loading = orders === null || leads === null

  return (
    <div className="grid gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Таможенные расчёты <span className="text-accent-text">{'// Брокер'}</span>
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Сделки, где вы подключены: оценка платежей по кодам ТН ВЭД, разрешительные
          документы и полная история расчётов.
        </p>
      </div>

      <BrokerSummaryCards loading={loading} counters={counters} />

      <BrokerQueue loading={loading} rows={rows} />

      {/* Контроль точности (референс): действующее правило видимости Р-3/Р-5.
          Ссылка «Проверить логи» из макета не переносится — журнала у брокера
          нет (Д-24). */}
      <Card>
        <CardContent className="flex items-start gap-4 p-5">
          <span
            aria-hidden="true"
            className="flex size-10 shrink-0 items-center justify-center rounded-md bg-accent/10"
          >
            <ShieldCheck className="size-5 text-accent-text" />
          </span>
          <div>
            <h2 className="text-sm font-semibold">Контроль точности</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Все расчёты автоматически сохраняются в истории сделки — она доступна вам
              и менеджеру. Клиент видит только актуальный результат таможенного расчёта
              после вашего подтверждения.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
