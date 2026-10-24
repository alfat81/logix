'use client'

// Анкета запроса (вынесено из LeadCard при резке, P1-19): контакты
// (клиент справочника либо сырой контакт запроса) + бланк груза
// (CargoGroups — общий показ для лида и заявки, Ж1). Правка —
// P1-02, диффы изменений в журнал пишет сервер.
import { Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CargoGroups } from '@/components/admin/CargoGroups'
import { InfoField } from '@/components/admin/InfoField'
import type { LeadFull } from './types'

export function LeadAnketaCard({
  lead,
  editable,
  onEdit,
}: {
  lead: LeadFull
  editable: boolean
  onEdit: () => void
}) {
  const contactEntries: [string, string | null][] = lead.customer
    ? [
        ['Клиент (справочник)', lead.customer.name],
        ['Телефон', lead.customer.phone || null],
        ['Email', lead.customer.email || null],
      ]
    : lead.rawContact
      ? [
          ['Контакт', lead.rawContact.name],
          ['Телефон', lead.rawContact.phone ?? null],
          ['Email', lead.rawContact.email ?? null],
        ]
      : []

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">Анкета запроса</CardTitle>
          {editable && (
            <Button size="sm" variant="outline" onClick={onEdit}>
              <Pencil className="size-4" />
              Править анкету
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="grid gap-5">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          {contactEntries.map(
            ([label, value]) => value && <InfoField key={label} label={label} value={value} />
          )}
          {contactEntries.every(([, v]) => !v) && (
            <span className="text-muted-foreground text-sm">Контакты не указаны</span>
          )}
        </div>
        {/* Пустая анкета / чужие ключи / группы бланка — решает сам
            CargoGroups (единый показ для лида и заявки, Ж1) */}
        <CargoGroups
          route={lead}
          cargoInfo={lead.cargoInfo}
          emptyText="Анкета груза не заполнена (запрос зарегистрирован без подробностей)"
        />
      </CardContent>
    </Card>
  )
}
