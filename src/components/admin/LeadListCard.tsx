import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  TRANSPORT_TYPE_LABELS,
  type TransportTypeCode,
} from '@/lib/route-fields'
import { formatMoney, isCurrencyCode } from '@/lib/money'
import { LeadStatusBadge } from '@/components/admin/LeadStatusBadge'
import { WaitingBadge } from '@/components/admin/WaitingBadge'
import { readLeadCargo, type LeadStatus } from '@/lib/leads'

// ─── Карточка лида в списке (В5) — v0.4.0 (BRANDBOOK §4.3) ──────────
// Та же анатомия, что у карточки заявки (OrderCard), но БЕЗ степпера —
// лид до конвертации этапов не имеет (§4.3, зафиксировано в брендбуке);
// решение владельца «делаем новую карточку по образцу заявки»:
//   строка 1 — дата (tabular-nums, приглушённая; лид номера не имеет)
//              + бейдж статуса §3.2 + «Кабинет» у запросов И1;
//   строка 2 — маршрут Bold с типом-префиксом («Море: Шанхай →
//              Москва»), как §4.3 у заявки; нет маршрута — груз; нет
//              и груза — подпись-заглушка;
//   строка 3 — «Клиент: …» приглушённая (+ телефон, груз,
//              ответственный — колонки P1-01);
//   правый блок — аналог ETA-блока: цена выбранного варианта Coral
//              Bold + caption «N вар. · срок»; варианты без выбора —
//              «Вариантов: N»; пусто — «Без расчёта»; у won —
//              «Заявка №N» Success; у lost — «Отказ» приглушённая.

export type LeadOptionRow = {
  id: string
  description: string
  transportModes: string[] | null
  // P1-04: Decimal приходит строкой; валюта/НДС — метки
  price: string
  currency: string
  vatMode: string
  etaDays: number
  priorityFit: string
  isSelected: boolean
}

export type LeadRow = {
  id: string
  status: LeadStatus
  createdAt: string
  // DF-05: вычисляемое ожидание (кто держит мяч) — плашка у статуса
  waitingOnKind?: string | null
  waitingReason?: string | null
  waitingSince?: string | null
  // И1: 'manual' | 'cabinet' — бейдж «Кабинет» на карточке
  source: string
  rawContact: { name: string; phone?: string; email?: string } | null
  cargoInfo: Record<string, unknown> | null
  customer: { id: string; name: string; phone: string | null } | null
  // P1-01: ответственный менеджер (null = не назначен)
  assignee: { id: string; name: string } | null
  options: LeadOptionRow[]
  order: { id: string; number: string } | null
  // P1-03: маршрут/тип — строка 2 карточки (колонки; легаси — Json)
  originCity: string | null
  originCountry: string | null
  destinationCity: string | null
  destinationCountry: string | null
  transportType: string | null
}

const fmtDate = (iso: string): string => new Date(iso).toLocaleDateString('ru-RU')

// Контакты лида — клиент из справочника либо сырые rawContact
// (В1: до конвертации клиента может ещё не быть).
function contactOf(lead: LeadRow): { name: string; phone: string } {
  if (lead.customer) {
    return { name: lead.customer.name, phone: lead.customer.phone ?? '' }
  }
  return { name: lead.rawContact?.name ?? 'Без контактов', phone: lead.rawContact?.phone ?? '' }
}

// Строка 2: как в RouteLine заявки — город, при пустом городе —
// страна (§4.3 «Море: Шанхай → Москва»); колонки P1-03 — первичный
// источник, легаси-ключи Json (from/to) — fallback.
function RouteLine({ lead }: { lead: LeadRow }) {
  const cargo = readLeadCargo(lead.cargoInfo)
  const from =
    lead.originCity?.trim() ||
    lead.originCountry?.trim() ||
    (typeof cargo.from === 'string' ? cargo.from : '')
  const to =
    lead.destinationCity?.trim() ||
    lead.destinationCountry?.trim() ||
    (typeof cargo.to === 'string' ? cargo.to : '')
  if (!from && !to) {
    const cargoName = typeof cargo.cargoName === 'string' ? cargo.cargoName : ''
    return (
      <div className="truncate font-semibold text-muted-foreground">
        {cargoName || 'Маршрут не указан'}
      </div>
    )
  }
  const transport = lead.transportType
    ? TRANSPORT_TYPE_LABELS[lead.transportType as TransportTypeCode]
    : null
  return (
    <div className="truncate font-semibold">
      {transport ? `${transport}: ` : ''}
      {from || '—'} <span className="font-normal text-muted-foreground">→</span> {to || '—'}
    </div>
  )
}

// Правый блок — аналог ETA-блока заявки (§4.3): вместо даты — деньги
// и срок выбранного варианта (P1-04: цена с валютой).
function OptionsBlock({ lead }: { lead: LeadRow }) {
  if (lead.status === 'won') {
    return (
      <span className="text-sm font-semibold text-success">
        {lead.order ? `Заявка №${lead.order.number}` : 'Выигран'}
      </span>
    )
  }
  if (lead.status === 'lost') {
    return <span className="text-sm text-muted-foreground">Отказ</span>
  }
  const selected = lead.options.find((o) => o.isSelected)
  if (selected) {
    return (
      <div className="text-right">
        <div className="text-sm font-semibold text-foreground tabular-nums">
          {formatMoney(selected.price, isCurrencyCode(selected.currency) ? selected.currency : 'RUB')}
        </div>
        <div className="text-xs text-muted-foreground">
          {lead.options.length} вар. · {selected.etaDays} дн.
        </div>
      </div>
    )
  }
  if (lead.options.length > 0) {
    return (
      <div className="text-right">
        <div className="text-sm font-semibold tabular-nums">Вариантов: {lead.options.length}</div>
        <div className="text-xs text-muted-foreground">вариант не выбран</div>
      </div>
    )
  }
  return <span className="text-sm text-muted-foreground">Без расчёта</span>
}

export function LeadListCard({ lead }: { lead: LeadRow }) {
  const contact = contactOf(lead)
  const cargo = readLeadCargo(lead.cargoInfo)
  const cargoName = typeof cargo.cargoName === 'string' ? cargo.cargoName : ''
  return (
    <Link href={`/admin/leads/${lead.id}`} className="block group">
      <Card className="p-4 transition-colors group-hover:border-ring">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-muted-foreground tabular-nums">
                от {fmtDate(lead.createdAt)}
              </span>
              <LeadStatusBadge status={lead.status} />
              <WaitingBadge kind={lead.waitingOnKind ?? null} reason={lead.waitingReason ?? null} since={lead.waitingSince ?? null} />
              {/* И1: запрос пришёл из клиентского кабинета — менеджеру
                  видно происхождение до открытия карточки */}
              {lead.source === 'cabinet' && <Badge variant="outline">Кабинет</Badge>}
            </div>
            <RouteLine lead={lead} />
            <div className="truncate text-sm text-muted-foreground">
              {`Клиент: ${contact.name}`}
              {contact.phone ? ` · ${contact.phone}` : ''}
              {cargoName ? ` · груз: ${cargoName}` : ''}
              {lead.assignee ? ` · отв. ${lead.assignee.name}` : ''}
            </div>
          </div>
          <div className="shrink-0 pt-0.5">
            <OptionsBlock lead={lead} />
          </div>
        </div>
      </Card>
    </Link>
  )
}
