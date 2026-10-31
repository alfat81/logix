'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { CheckCircle2, Loader2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import { readApiResponse } from '@/lib/api-client'
import { CargoGroups } from '@/components/admin/CargoGroups'
import {
  BrokerOrderStatusBadge,
  BrokerStageStatusBadge,
} from '@/components/broker/BrokerBadges'
import { BrokerEstimateForm, type BrokerEstimate } from '@/components/broker/BrokerEstimateForm'
import { DocumentsSection } from '@/components/documents/DocumentsSection'
import { PermitsSection } from '@/components/permits/PermitsSection'
import { CARGO_PROFILE_LABELS, type CargoProfile, type OrderStatus, type StageStatus } from '@/lib/order-constants'

// ─── Карточка заявки для брокера (Д, роадмап 5а) ───────────────────
// «Видит заявку целиком с момента расчёта — статус, все документы, не
// только свой этап»: вся цепочка этапов со статусами и датами, анкета
// груза, справочные поля (Инкотермс/ТН ВЭД — специфика таможенного
// представителя). Без подрядчиков и цен (периметр решения №1 от
// 14.10.2026 распространён на брокера), без заметок и контактов.

type BrokerStage = {
  id: string
  name: string
  sequence: number
  status: StageStatus
  plannedDate: string | null
  actualDate: string | null
}

type BrokerOrder = {
  id: string
  number: string
  status: OrderStatus
  createdAt: string
  cargoInfo: Record<string, unknown> | null
  // DF-23 (б): маршрут/метрики — без веса/объёма/маршрута платежи
  // не оценить (DF-18); терялись в карточке заявки
  originCity?: string | null
  originCountry?: string | null
  destinationCity?: string | null
  destinationCountry?: string | null
  transportType?: string | null
  readyDate?: string | null
  weightKg?: string | number | null
  volumeM3?: string | number | null
  placesCount?: number | null
  incoterm: string | null
  incotermPlace: string | null
  hsCode: string | null
  cargoProfile: CargoProfile
  customerName: string | null
  leadId: string | null
  estimate: BrokerEstimate | null
  stages: BrokerStage[]
}

const fmtDate = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleDateString('ru-RU') : '—'

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  )
}

export function BrokerOrderCard() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { toast } = useToast()

  const [order, setOrder] = useState<BrokerOrder | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/broker/orders/${id}`)
      if (res.status === 404) {
        toast({ title: 'Заявка не найдена', variant: 'destructive' })
        router.replace('/broker')
        return
      }
      const data = await readApiResponse<{ order: BrokerOrder; error?: string }>(res)
      if (!res.ok) throw new Error(data.error || 'Ошибка загрузки')
      setOrder(data.order)
    } catch (e) {
      toast({
        title: 'Не удалось загрузить заявку',
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

  if (loading || !order) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground text-sm py-16 justify-center">
        <Loader2 className="size-4 animate-spin" />
        Загрузка…
      </div>
    )
  }

  const doneCount = order.stages.filter((s) => s.status === 'done').length

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight font-mono">{order.number}</h1>
        <BrokerOrderStatusBadge status={order.status} />
        <span className="text-xs text-muted-foreground ml-auto">
          Этапы: {doneCount} из {order.stages.length} завершено
        </span>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Условия перевозки</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <Info label="Клиент" value={order.customerName ?? '—'} />
          <Info label="Создана" value={fmtDate(order.createdAt)} />
          {/* Инкотермс и ТН ВЭД — справочные поля (роадмап 4/6), но
              именно они определяют распределение таможенных обязанностей
              и ставки пошлин — брокеру нужны в первую очередь */}
          <Info label="Инкотермс" value={order.incoterm ?? '—'} />
          {/* DF-23 (г): место условия поставки — рядом с кодом (DF-19) */}
          <Info label="Место поставки" value={order.incotermPlace ?? '—'} />
          <Info label="ТН ВЭД" value={order.hsCode ?? '—'} />
          <Info label="Груз" value={CARGO_PROFILE_LABELS[order.cargoProfile]} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Груз и маршрут</CardTitle>
        </CardHeader>
        <CardContent>
          <CargoGroups
            route={order}
            cargoInfo={order.cargoInfo}
            emptyText="Анкета груза не заполнена — запросите данные у менеджера"
          />
        </CardContent>
      </Card>

      <h2 className="text-lg font-semibold">Этапы</h2>
      <div className="grid gap-2">
        {[...order.stages]
          .sort((a, b) => a.sequence - b.sequence)
          .map((s) => (
            <Card key={s.id} className="p-4">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold tabular-nums">
                  {s.sequence}
                </div>
                <div className="min-w-44 flex-1">
                  <span className="font-medium">{s.name}</span>
                  <div className="text-xs text-muted-foreground flex items-center gap-3 mt-0.5">
                    <span className="flex items-center gap-1">
                      <CheckCircle2 className="size-3" />
                      факт: {fmtDate(s.actualDate)}
                    </span>
                    <span>план: {fmtDate(s.plannedDate)}</span>
                  </div>
                </div>
                <BrokerStageStatusBadge status={s.status} />
              </div>
            </Card>
          ))}
      </div>

      {/* Оценка живёт на связи с лидом (5а) — у заявки из лида форму
          можно уточнять прямо здесь; у прямой связи с заявкой расчёта
          не было, оценивать нечего */}
      {order.leadId ? (
        <BrokerEstimateForm leadId={order.leadId} estimate={order.estimate} onSaved={load} />
      ) : (
        <Card className="p-4 text-sm text-muted-foreground">
          <Badge variant="outline" className="mb-1">Оценка платежей</Badge>
          <div>
            Заявка создана без расчёта воронки — связи с этапом расчёта нет,
            оценивать нечего.
          </div>
        </Card>
      )}

      {/* ── DF-16: разрешительные документы заявки — перечень из оценки
          и добавленные брокером строки; закрытие загрузкой файла в
          строке ──────────────────────────────────────────────────── */}
      <PermitsSection
        viewer="broker"
        permitsUrl={`/api/broker/orders/${order.id}/permits`}
        createUrl={`/api/broker/orders/${order.id}/permits`}
        documentUrlFor={(permitId) => `/api/broker/permits/${permitId}/document`}
        onChanged={load}
      />

      {/* ── Е: документы сделки (роадмап 5) — видимость заявки
          целиком (5а): товаросопроводительные, разрешительные,
          правки с комментариями; загрузка ДТ и ответных бумаг —
          отсюда. Внутренние документы менеджера не отдаются. */}
      <DocumentsSection
        documentsUrl={`/api/broker/orders/${order.id}/documents`}
        versionsUrlFor={(docId) => `/api/broker/documents/${docId}/versions`}
        emptyText="Документов нет — загрузите ДТ или запросите бумаги у менеджера"
      />
    </div>
  )
}
