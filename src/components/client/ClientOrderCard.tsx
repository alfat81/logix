'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, CalendarDays, Loader2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'
import { readApiResponse } from '@/lib/api-client'
// CargoGroups — общий доменный бланк анкеты (см. комментарий в
// ClientHome): показывает собственную анкету клиента по заявке.
import { CargoGroups } from '@/components/admin/CargoGroups'
import { DocumentsSection } from '@/components/documents/DocumentsSection'
import { PermitsSection } from '@/components/permits/PermitsSection'
import type { PermitRowUi } from '@/components/permits/types'
import { ActivityFeed, type ActivityRow } from '@/components/admin/ActivityFeed'
import {
  ClientOrderStatusBadge,
  ClientStageStatusBadge,
} from '@/components/client/ClientBadges'
import { WAITING_CLIENT_LABELS, type WaitingReason } from '@/lib/waiting'
import { Clock } from 'lucide-react'
import type { OrderStatus, StageStatus } from '@/lib/order-constants'

// Карточка заявки в кабинете клиента (И1): номер, статус, собственная
// анкета груза и ВСЕ этапы цепочки со статусами и датами (клиенту
// нужен контекст: что пройдено, что впереди). Только чтение — кнопок
// действий нет; без подрядчиков, ставок и цен (решение вопроса №1).

type ClientStage = {
  id: string
  name: string
  sequence: number
  status: StageStatus
  plannedDate: string | null
  actualDate: string | null
}

type ClientOrder = {
  id: string
  number: string
  status: OrderStatus
  createdAt: string
  cargoInfo: Record<string, unknown> | null
  // DF-23 (б): маршрут/метрики — блок «Маршрут» карточки заявки
  // строится из колонок (как в карточке ЗАПРОСА клиента)
  originCity?: string | null
  originCountry?: string | null
  destinationCity?: string | null
  destinationCountry?: string | null
  transportType?: string | null
  readyDate?: string | null
  weightKg?: string | number | null
  volumeM3?: string | number | null
  placesCount?: number | null
  stages: ClientStage[]
  // DF-05: нейтральное ожидание — приходит ТОЛЬКО когда мяч у клиента
  // (роут client/orders/[id] отдаёт служебные kind наружу нельзя);
  // текст — WAITING_CLIENT_LABELS, никаких «менеджер/брокер/этап».
  waiting: { reason: string | null; since: string } | null
  // DF-21: журнал сделки — события с аудиторией 'client' (заметки
  // «видна клиенту», статусы, документы); без служебных меток
  activities?: ClientActivityRow[]
  // DF-16: разрешительные заявки (наружная проекция — staffNote не
  // покидает сервер; загрузкой файла в строке клиент её закрывает)
  permitRequirements?: PermitRowUi[]
}

const fmtDate = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleDateString('ru-RU') : '—'

// DF-21: строка журнала клиентского кабинета — проекция ActivityFeed
type ClientActivityRow = ActivityRow

export function ClientOrderCard() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { toast } = useToast()
  const [order, setOrder] = useState<ClientOrder | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/client/orders/${id}`)
      if (res.status === 404) {
        toast({ title: 'Заявка не найдена', variant: 'destructive' })
        router.replace('/client')
        return
      }
      const data = await readApiResponse<{ order?: ClientOrder; error?: string }>(res)
      if (!res.ok) throw new Error(data.error || 'Ошибка загрузки')
      setOrder(data.order ?? null)
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
        {loading && <Loader2 className="size-4 animate-spin" />}
        {!loading && 'Заявка не найдена'}
      </div>
    )
  }

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/client"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Ко всем заявкам
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h1 className="text-2xl font-semibold tracking-tight font-mono">{order.number}</h1>
        <ClientOrderStatusBadge status={order.status} />
        {/* DF-05: нейтральная плашка «что ждём от вас» — без служебных
            терминов (аудиторный тест §4.5) */}
        {order.waiting && (
          <span className="inline-flex items-center gap-1.5 rounded-md border bg-muted px-2 py-1 text-xs text-muted-foreground">
            <Clock className="size-3 shrink-0" aria-hidden />
            {WAITING_CLIENT_LABELS[(order.waiting.reason ?? '') as WaitingReason] ??
              'Ожидает вашего подтверждения'}
          </span>
        )}
        <span className="text-xs text-muted-foreground flex items-center gap-1">
          <CalendarDays className="size-3" />
          создана {fmtDate(order.createdAt)}
        </span>
      </div>

      {/* Этапы — главное содержимое кабинета: имя из каталога,
          статус, плановая и фактическая даты. Исполнитель этапа и
          ставки клиенту не показываются (решение вопроса №1). */}
      <Card className="p-0">
        <CardContent className="p-4 grid gap-3">
          <h2 className="text-base font-semibold">Этапы перевозки</h2>
          <div className="grid gap-2">
            {order.stages.map((s) => (
              <div
                key={s.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border px-3 py-2"
              >
                <span className="text-xs text-muted-foreground tabular-nums w-6">
                  {s.sequence}.
                </span>
                <span className="font-medium flex-1 min-w-40">{s.name}</span>
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  план: {fmtDate(s.plannedDate)}
                  {s.status === 'done' && <> · факт: {fmtDate(s.actualDate)}</>}
                </span>
                <ClientStageStatusBadge status={s.status} />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Собственная анкета груза клиента (снимок с запроса) */}
      <Card className="p-0">
        <CardContent className="p-4 grid gap-3">
          <h2 className="text-base font-semibold">Груз и маршрут</h2>
          <CargoGroups
            route={order}
            cargoInfo={order.cargoInfo}
            emptyText="Анкета груза не заполнялась — уточните детали у менеджера."
          />
        </CardContent>
      </Card>

      {/* DF-16: разрешительные документы вашей заявки — что ждём от вас,
          закрывается загрузкой файла прямо в строке; до загрузки видно
          напоминание наверху секции */}
      <PermitsSection
        viewer="client"
        initialPermits={order.permitRequirements ?? []}
        documentUrlFor={(permitId) => `/api/client/permits/${permitId}/document`}
        onChanged={load}
        emptyText="Разрешительных документов по заявке нет"
      />

      {/* DF-21: журнал сделки — заметки менеджера «видна клиенту» и
          события статусов; без служебных меток и внутренних событий */}
      <ActivityFeed
        activities={order.activities ?? []}
        emptyText="Событий пока нет — здесь появятся новости по вашей заявке"
      />

      {/* ── Е: документы сделки (роадмап 5) — клиент загружает проекты
          и видит правки брокера/менеджера в истории версий; обмен
          внутри сервиса, без почты. Внутренние документы менеджера
          клиенту не видны (изоляция в API). */}
      <DocumentsSection
        documentsUrl={`/api/client/orders/${order.id}/documents`}
        versionsUrlFor={(docId) => `/api/client/documents/${docId}/versions`}
        emptyText="Документов нет — прикрепите проект документа или напишите менеджеру"
      />
    </div>
  )
}
