'use client'

import Link from 'next/link'
import { CalendarDays, ChevronRight, Loader2, PackageOpen } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { ClientOrderStatusBadge } from '@/components/client/ClientBadges'
import { readLeadCargo } from '@/lib/leads'
import { routeLineOf } from '@/lib/route-fields'
import type { OrderStatus, StageStatus } from '@/lib/order-constants'

// TU-01.7 (волна 3): секция «Мои заявки» Обзора — выезд из ClientHome
// (лимит 300 строк, RULES 2.14; integrity IC-09). Логика прежняя:
// список заявок клиента с этапами и статусами, только чтение.

export type ClientStage = {
  id: string
  name: string
  sequence: number
  status: StageStatus
  plannedDate: string | null
  actualDate: string | null
}

export type ClientOrder = {
  id: string
  number: string
  status: OrderStatus
  createdAt: string
  cargoInfo: Record<string, unknown> | null
  // TU-01.7: вес заявки (метрика маршрута в списке) — сводка «Общий объём»
  weightKg?: string | null
  // DF-23 (б): маршрут/метрики — строка маршрута списка из колонок
  originCity?: string | null
  originCountry?: string | null
  destinationCity?: string | null
  destinationCountry?: string | null
  stages: ClientStage[]
}

const fmtDate = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleDateString('ru-RU') : '—'

// Краткая строка маршрута/груза: маршрут — из колонок (DF-23 (б),
// легаси-fallback routeLineOf), груз — из анкеты (readLeadCargo
// толерантен к чужой структуре)
export function routeOf(row: ClientOrder): { from: string; to: string; cargoName: string } {
  const c = readLeadCargo(row.cargoInfo)
  const s = (v: unknown): string => (typeof v === 'string' && v ? v : '')
  return { ...routeLineOf(row, row.cargoInfo), cargoName: s(c.cargoName) }
}

export function ClientOrdersList({ orders }: { orders: ClientOrder[] | null }) {
  return (
    <section className="grid gap-3" id="orders" aria-labelledby="orders-title">
      <div>
        <h2 id="orders-title" className="text-lg font-semibold tracking-tight">
          Мои заявки
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Статусы этапов каждой перевозки — от забора груза до доставки получателю.
        </p>
      </div>

      {orders === null ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm py-8 justify-center">
          <Loader2 className="size-4 animate-spin" />
          Загрузка…
        </div>
      ) : orders.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">
          <PackageOpen className="size-8 mx-auto mb-3 opacity-50" />
          Заявок пока нет. Отправьте запрос на расчёт — как только менеджер
          оформит заявку, её статусы появятся здесь.
        </Card>
      ) : (
        <div className="grid gap-2">
          {orders.map((o) => {
            const r = routeOf(o)
            const done = o.stages.filter((s) => s.status === 'done').length
            const nearest = o.stages.find((s) => s.status !== 'done') ?? null
            return (
              <Card key={o.id} className="p-0">
                <Link href={`/client/orders/${o.id}`}>
                  <CardContent className="p-4 flex flex-wrap items-center gap-x-4 gap-y-2 hover:bg-accent/50 transition-colors">
                    <span className="font-semibold font-mono text-lg">{o.number}</span>
                    <ClientOrderStatusBadge status={o.status} />
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <CalendarDays className="size-3" />
                      создана {fmtDate(o.createdAt)}
                    </span>
                    <div className="min-w-48 flex-1">
                      <div className="text-sm truncate">
                        {r.cargoName || <span className="text-muted-foreground">Груз не указан</span>}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {r.from || r.to ? `${r.from || '—'} → ${r.to || '—'}` : 'Маршрут не указан'}
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground whitespace-nowrap">
                      Этапы: {done} из {o.stages.length}
                      {nearest && <> · далее «{nearest.name}»</>}
                    </div>
                    <ChevronRight className="size-4 text-muted-foreground ml-auto" />
                  </CardContent>
                </Link>
              </Card>
            )
          })}
        </div>
      )}
    </section>
  )
}
