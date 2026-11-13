'use client'

import { Loader2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { formatTons } from '@/lib/money'

// TU-01.7 (волна 3): три сводные карточки Обзора кабинета клиента
// (референс clientcabinet.png). Все значения — реальные данные БД из
// уже загруженных списков (единая точка правды, без отдельных API):
// активные заявки — ORDER_ACTIVE_STATUSES, «на согласовании» — запросы
// в статусе «рассчитан» (варианты предложены, решение не принято),
// общий объём — сумма весов заявок (weightKg). Демо-значения макета
// (04/02/12.4) не переносятся; без данных — «—».
export type ClientSummaryCardsProps = {
  loading: boolean
  activeOrders: number
  onApproval: number
  tons: string | null
}

export function ClientSummaryCards({ loading, activeOrders, onApproval, tons }: ClientSummaryCardsProps) {
  if (loading) {
    return (
      <div className="grid gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Card key={i} className="p-6">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Loader2 className="size-4 animate-spin" />
              Загрузка…
            </div>
          </Card>
        ))}
      </div>
    )
  }

  const items = [
    { label: 'Активные заявки', value: String(activeOrders), unit: 'заявок', accent: false },
    { label: 'На согласовании', value: String(onApproval), unit: 'запросов', accent: true },
    { label: 'Общий объём', value: tons ?? '—', unit: tons ? 'тонн' : '', accent: false },
  ]

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {items.map((it) => (
        <Card key={it.label} className="p-6">
          <CardContent className="p-0">
            <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              {it.label}
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span
                className={`text-4xl font-bold tracking-tight ${it.accent ? 'text-accent-text' : ''}`}
              >
                {it.value}
              </span>
              {it.unit && (
                <span className="text-xs uppercase tracking-widest text-muted-foreground">
                  {it.unit}
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

// Хелпер для ClientHome: тонн из списка весов weightKg (строки Decimal).
// Форматирование — только через money.ts (RULES 2.15 / IC-09).
export function tonsFromWeights(weights: (string | number | null | undefined)[]): string | null {
  const total = weights.reduce<number>((sum, w) => {
    const n = typeof w === 'string' ? Number(w) : (w ?? NaN)
    return Number.isFinite(n) ? sum + n : sum
  }, 0)
  if (total <= 0) return null
  return formatTons(total)
}
