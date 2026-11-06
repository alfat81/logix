'use client'

import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { InfoField } from '@/components/admin/InfoField'
import { CARGO_PROFILE_LABELS } from '@/lib/order-constants'
import { fmtDate, type OrderFull } from '@/components/admin/order/types'

// ─── Ж1: информационные карточки заявки (выезд из page.tsx, RULES 2.14)
// «Условия перевозки» (Ж1-бланк) и карточка лид-источника (В4 — снимок
// груза и условий, ссылка на историю запроса).

export function OrderInfoCards({ order }: { order: OrderFull }) {
  const doneCount = order.stages.filter((s) => s.status === 'done').length
  const problemCount = order.stages.filter((s) => s.status === 'problem').length

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Условия перевозки</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <InfoField label="Клиент" value={order.customer.name} />
          {/* Ж1: контакты клиента прямо в карточке — менеджеру не
              ходить за ними в справочник */}
          <InfoField label="Телефон клиента" value={order.customer.phone ?? '—'} />
          <InfoField label="Email клиента" value={order.customer.email ?? '—'} />
          <InfoField label="Юрлицо" value={order.legalEntity.name} />
          <InfoField label="Договор" value={`№ ${order.contract.number}`} />
          <InfoField label="Создана" value={fmtDate(order.createdAt)} />
          <InfoField label="Инкотермс" value={order.incoterm ?? '—'} />
          <InfoField label="Место поставки" value={order.incotermPlace ?? '—'} />
          <InfoField label="ТН ВЭД" value={order.hsCode ?? '—'} />
          <InfoField label="Груз" value={CARGO_PROFILE_LABELS[order.cargoProfile]} />
          <InfoField
            label="Этапы"
            value={`${doneCount}/${order.stages.length} завершено${problemCount ? ` · ${problemCount} проблема` : ''}`}
          />
        </CardContent>
      </Card>

      {/* ── Ж1: лид-источник (заявки из воронки В4) ───────────────────
          Снимки груза и условий уже скопированы в заявку — ссылка
          ведёт к истории запроса (варианты, отказы, анкета лида) */}
      {order.lead && (
        <Card className="p-4 flex flex-wrap items-center gap-4 border-success/50 bg-success/5">
          <div className="flex-1">
            <div className="font-medium">
              Конвертирована из запроса от {fmtDate(order.lead.createdAt)}
            </div>
            <div className="text-sm text-muted-foreground">
              Груз и условия скопированы снимком — заявка живёт независимо от запроса
            </div>
          </div>
          <Button variant="outline" asChild>
            <Link href={`/admin/leads/${order.lead.id}`}>
              Запрос-источник
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </Card>
      )}
    </>
  )
}
