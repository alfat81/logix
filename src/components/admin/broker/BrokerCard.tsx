'use client'

import { Pencil, ShieldCheck, ShieldOff, UsersRound } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { BROKER_KIND_TEXT, fmtBrokerDate, type BrokerRow } from './types'

// v0.5.0 (P1-22, BRANDBOOK §4.3-lite): карточка брокера в единой
// анатомии справочников (как клиенты/договоры в P1-21): строка 1 —
// «с {дата}» (tabular, приглушённая) + вид (штатный/привлечённый) +
// признак деактивации; строка 2 — название Bold; строка 3 — телефон
// (логин) и заметка. Правый блок — счётчик сделок (как ETA-блок) и
// действия: правка, деактивация/возврат (тексты 1:1).
export function BrokerCard({
  broker,
  onEdit,
  onToggleActive,
  onManageUsers,
  saving,
}: {
  broker: BrokerRow
  onEdit: (b: BrokerRow) => void
  onToggleActive: (b: BrokerRow) => void
  // DF-02A Блок 5: список сотрудников (люди портала брокера)
  onManageUsers: (b: BrokerRow) => void
  saving: boolean
}) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground tabular-nums">
              с {fmtBrokerDate(broker.createdAt)}
            </span>
            <Badge variant="outline" className="text-xs text-muted-foreground">
              {broker.isInHouse ? BROKER_KIND_TEXT.in_house : BROKER_KIND_TEXT.external}
            </Badge>
            {!broker.isActive && (
              <Badge
                variant="outline"
                className="text-xs bg-destructive/10 text-destructive border-transparent"
              >
                деактивирован
              </Badge>
            )}
          </div>
          <div className="mt-0.5 truncate font-semibold">{broker.companyName}</div>
          <div className="mt-0.5 truncate text-sm text-muted-foreground">
            <span className="font-mono">{broker.phone}</span>
            {broker.comment && <span className="ml-2">· {broker.comment}</span>}
          </div>
          {/* DF-02: контактный email компании — адресат уведомлений (DF-03);
              строка появляется только у брокера с email */}
          {broker.email && (
            <div className="mt-0.5 truncate text-sm text-muted-foreground">{broker.email}</div>
          )}
        </div>
        <div className="flex shrink-0 items-start gap-2">
          <div className="text-right">
            <div className="text-sm font-semibold tabular-nums">
              Сделок: {broker._count.leadLinks + broker._count.orderLinks}
            </div>
            <div className="mt-1 flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                onClick={() => onManageUsers(broker)}
                title="Сотрудники — люди с доступом в портал"
              >
                <UsersRound className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                onClick={() => onEdit(broker)}
                title="Править брокера"
              >
                <Pencil className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                disabled={saving}
                onClick={() => onToggleActive(broker)}
                title={
                  broker.isActive
                    ? 'Деактивировать — доступ в портал закроется, связи со сделками сохранятся'
                    : 'Вернуть в работу'
                }
              >
                {broker.isActive ? (
                  <ShieldOff className="size-4 text-destructive" />
                ) : (
                  <ShieldCheck className="size-4" />
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </Card>
  )
}
