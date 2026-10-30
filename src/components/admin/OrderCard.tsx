import Link from 'next/link'
import { CircleAlert } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card } from '@/components/ui/card'
import { TRANSPORT_TYPE_LABELS, type TransportTypeCode } from '@/lib/route-fields'
import { type OrderStatus } from '@/lib/order-constants'
import { OrderStepper, type StepperStage } from '@/components/admin/OrderStepper'
import { OrderStatusBadge } from '@/components/admin/OrderStatusBadge'
import { WaitingBadge } from '@/components/admin/WaitingBadge'

// v0.3.1 (BRANDBOOK §4.3): анатомия карточки заявки в списке —
// по референс-макету владельца «Admin Workspace» (D24):
//   строка 1 — номер (tabular-nums, приглушённый) + бейдж статуса §3.2;
//   строка 2 — заголовок маршрута Bold, стрелки — обычный текст
//              (префикс — тип перевозки: «Море: Шанхай → Москва»);
//   строка 3 — «Клиент: …» приглушённая (+ договор, ответственный —
//              caption-дополнение агента: колонки P1-01 сохранены,
//              зафиксировано в отчёте v0.3.1);
//   правый блок — ETA Coral Bold tabular-nums + caption «Осталось
//              N дней»; у завершённой — «Доставлено» Success;
//              у расчётной — «Расчёт в процессе» приглушённая;
//   степпер этапов + прогресс-бар — OrderStepper (§4.3);
//   задержка — строка с круглой иконкой «!» и текстом Brick (§5.3).
// Данные Ж4 «ближайший этап/исполнитель» сохранены caption-строкой
// под степпером («Сейчас: …») — макет её не задаёт, удаление потеряло
// бы функцию назначения исполнителей (P1-01/Ж4).

export type OrderRow = {
  id: string
  number: string
  status: OrderStatus
  incoterm: string | null
  cargoProfile: string
  createdAt: string
  // DF-05: вычисляемое ожидание (кто держит мяч) — плашка у статуса
  waitingOnKind?: string | null
  waitingReason?: string | null
  waitingSince?: string | null
  // P1-01: ответственный менеджер и маркер движения
  assignee: { id: string; name: string } | null
  updatedAt: string
  customer: { id: string; name: string; phone: string | null }
  contract: { id: string; number: number }
  legalEntity: { id: string; name: string }
  // P1-03: маршрут и тип перевозки — строка 2 карточки
  originCity: string | null
  originCountry: string | null
  destinationCity: string | null
  destinationCountry: string | null
  transportType: string | null
  stagesTotal: number
  stagesDone: number
  stagesProblem: number
  nearestStage: {
    code: string
    name: string
    status: string
    plannedDate: string | null
    contractorName: string | null
  } | null
  overdue: boolean
  overdueStage: string | null
  // v0.3.1: ETA и этапы степпера (lib/orders.ts, API orders GET)
  etaDate: string | null
  stages: StepperStage[]
}

// Русская плюрализация: 1 день / 2 дня / 5 дней.
function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few
  return many
}

// Даты этапов — UTC-полуночь (lib/orders.ts todayUtcMidnight), день
// ETA и «сегодня» сравниваем в тех же координатах.
function utcDayMs(iso: string): number {
  const d = new Date(iso)
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
}

function EtaBlock({ order }: { order: OrderRow }) {
  if (order.status === 'completed') {
    return <span className="text-sm font-semibold text-success">Доставлено</span>
  }
  if (order.status === 'cancelled') {
    return <span className="text-sm text-muted-foreground">Отменена</span>
  }
  if (order.status === 'calculating') {
    return <span className="text-sm text-muted-foreground">Расчёт в процессе</span>
  }
  if (!order.etaDate) {
    return <span className="text-sm text-muted-foreground">Даты не заданы</span>
  }
  const days = Math.round((utcDayMs(order.etaDate) - utcDayMs(new Date().toISOString())) / 86_400_000)
  const dayWord = plural(Math.abs(days), 'день', 'дня', 'дней')
  return (
    <div className="text-right">
      <div className="text-sm font-semibold text-foreground tabular-nums">
        ETA: {new Date(order.etaDate).toLocaleDateString('ru-RU')}
      </div>
      <div className={cn('text-xs', days < 0 ? 'text-destructive' : 'text-muted-foreground')}>
        {days < 0
          ? `Просрочка на ${Math.abs(days)} ${dayWord}`
          : days === 0
            ? 'Сегодня'
            : `Осталось ${days} ${dayWord}`}
      </div>
    </div>
  )
}

// Строка 2: тип перевозки как префикс («Море: Шанхай → Москва»),
// маршрут — города, при пустом городе — страна. Нет ни того ни
// другого — строки нет (не рисуем пустой заголовок).
function RouteLine({ order }: { order: OrderRow }) {
  const from = order.originCity?.trim() || order.originCountry?.trim() || null
  const to = order.destinationCity?.trim() || order.destinationCountry?.trim() || null
  if (!from && !to) return null
  const transport = order.transportType
    ? TRANSPORT_TYPE_LABELS[order.transportType as TransportTypeCode]
    : null
  return (
    <div className="truncate font-semibold">
      {transport ? `${transport}: ` : ''}
      {from ?? '—'} <span className="font-normal text-muted-foreground">→</span> {to ?? '—'}
    </div>
  )
}

export function OrderCard({ order }: { order: OrderRow }) {
  return (
    <Link href={`/admin/orders/${order.id}`} className="block group">
      <Card className="p-4 transition-colors group-hover:border-ring">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-muted-foreground tabular-nums">#{order.number}</span>
              <OrderStatusBadge status={order.status} />
              <WaitingBadge kind={order.waitingOnKind ?? null} reason={order.waitingReason ?? null} since={order.waitingSince ?? null} />
            </div>
            <RouteLine order={order} />
            <div className="truncate text-sm text-muted-foreground">
              Клиент: {order.customer.name} · договор {order.contract.number}
              {order.assignee ? ` · отв. ${order.assignee.name}` : ''}
            </div>
          </div>
          <div className="shrink-0 pt-0.5">
            <EtaBlock order={order} />
          </div>
        </div>

        <OrderStepper stages={order.stages} orderStatus={order.status} className="mt-3" />

        {/* Сохранённые колонки Ж4: ближайший этап + исполнитель + план
            (DF-21: подпись строки — «Ближайший этап: …», по карточке;
            задержка §4.3 — Brick с круглой иконкой «!». Строки — блоками
            (не flex-wrap): truncate-строка в flex-wrap раздувает
            min-content карточки и выдавала горизонтальный скролл на 375. */}
        <div className="mt-2 grid gap-1">
          <span className="truncate text-xs text-muted-foreground">
            {order.nearestStage ? (
              <>
                Ближайший этап: {order.nearestStage.name}
                {' · '}
                {order.nearestStage.contractorName ?? 'исполнитель не назначен'}
                {order.nearestStage.plannedDate
                  ? ` · план ${new Date(order.nearestStage.plannedDate).toLocaleDateString('ru-RU')}`
                  : ''}
              </>
            ) : (
              'Все этапы завершены'
            )}
          </span>
          {order.overdue && order.overdueStage && (
            <span className="flex items-center gap-1.5 text-sm text-destructive">
              <CircleAlert className="size-4 shrink-0" aria-hidden />
              Просрочка: {order.overdueStage}
            </span>
          )}
        </div>
      </Card>
    </Link>
  )
}
