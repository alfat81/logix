'use client'

// Поток A волна 1 (BL-7): общая строка запроса клиента (integrity IC-14 —
// дубликат блока ClientHome ~ ClientLeadArchive устранён вынесением).
// Ссылка на карточку, маршрут/груз, «Заявка N» у won, статус-бейдж.
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { ClientLeadStatusBadge } from '@/components/client/ClientBadges'
import { routeLineOf } from '@/lib/route-fields'
import { readLeadCargo } from '@/lib/leads'

export type ClientLeadRowData = {
  id: string
  status: 'new' | 'needs_data' | 'calculated' | 'client_approved' | 'won' | 'lost'
  createdAt: string
  cargoInfo: Record<string, unknown> | null
  originCity?: string | null
  originCountry?: string | null
  destinationCity?: string | null
  destinationCountry?: string | null
  order: { id: string; number: string } | null
}

export function clientLeadRouteOf(row: ClientLeadRowData): {
  from: string
  to: string
  cargoName: string
} {
  const c = readLeadCargo(row.cargoInfo)
  const s = (v: unknown): string => (typeof v === 'string' && v ? v : '')
  return { ...routeLineOf(row, row.cargoInfo), cargoName: s(c.cargoName) }
}

const fmtDate = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleDateString('ru-RU') : '—'

export function ClientLeadRow({ lead }: { lead: ClientLeadRowData }) {
  const r = clientLeadRouteOf(lead)
  return (
    <Card className="p-4 flex flex-wrap items-center gap-x-4 gap-y-2">
      <Link href={`/client/leads/${lead.id}`} className="min-w-48 flex-1 group">
        <div className="text-sm group-hover:underline">
          {r.cargoName || <span className="text-muted-foreground">Груз не указан</span>}
        </div>
        <div className="text-xs text-muted-foreground truncate">
          {r.from || r.to ? `${r.from || '—'} → ${r.to || '—'}` : 'Маршрут не указан'} · от{' '}
          {fmtDate(lead.createdAt)}
        </div>
      </Link>
      {lead.order ? (
        <Link
          href={`/client/orders/${lead.order.id}`}
          className="text-sm font-medium font-mono hover:underline"
        >
          Заявка {lead.order.number}
        </Link>
      ) : null}
      <ClientLeadStatusBadge status={lead.status} />
    </Card>
  )
}
