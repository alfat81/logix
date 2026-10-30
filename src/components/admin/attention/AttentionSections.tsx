'use client'

import Link from 'next/link'
import { MailX, PauseCircle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { LEAD_STATUS_LABELS } from '@/lib/leads'
import { ORDER_STATUS_LABELS } from '@/lib/order-constants'
import { daysWord, fmtDate, type LeadAttention, type StageAttention } from './types'

// v0.5.0 (P1-22): секции экрана «Требует внимания» — выезд из
// AttentionScreen.tsx (резка под лимит 300, RULES 2.14). Разметка
// строк и тексты 1:1.

// ── Секция про этапы заявок (просрочка/проблема/неназначенные) ──
export function StageSection({
  title,
  subtitle,
  icon,
  count,
  rows,
  tone,
}: {
  title: string
  subtitle: string
  icon: React.ReactNode
  count: number
  rows: StageAttention[]
  tone: 'destructive' | 'warning'
}) {
  if (count === 0) return null
  const hidden = count - rows.length

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          {icon}
          {title}
          <Badge
            variant="outline"
            className={
              tone === 'destructive'
                ? 'bg-destructive/10 text-destructive border-destructive/30'
                : 'bg-warning/10 text-warning-foreground border-warning/30'
            }
          >
            {count}
          </Badge>
        </CardTitle>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </CardHeader>
      <CardContent className="grid gap-2">
        {rows.map((r, i) => (
          <Link
            key={`${r.orderId}-${r.stageName}-${i}`}
            href={`/admin/orders/${r.orderId}`}
            className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border p-3 transition-colors hover:border-ring"
          >
            <span className="font-mono font-semibold min-w-20">{r.orderNumber}</span>
            <span className="min-w-40 flex-1">
              <span className="font-medium">{r.customerName}</span>
              <span className="text-xs text-muted-foreground block">
                {r.stageName}
                {r.contractorName ? ` · ${r.contractorName}` : ' · исполнитель не назначен'}
              </span>
            </span>
            {r.daysOverdue !== null && r.daysOverdue > 0 && (
              <Badge variant="destructive">
                {r.daysOverdue} {daysWord(r.daysOverdue)} просрочки
              </Badge>
            )}
            {r.plannedDate && (
              <span className="text-xs text-muted-foreground tabular-nums">
                план: {fmtDate(r.plannedDate)}
              </span>
            )}
            <Badge variant="outline" className="text-xs text-muted-foreground">
              {ORDER_STATUS_LABELS[r.orderStatus] ?? r.orderStatus}
            </Badge>
          </Link>
        ))}
        {hidden > 0 && (
          <div className="text-xs text-muted-foreground text-center pt-1">
            И ещё {hidden} —{' '}
            <Link href="/admin/orders" className="underline underline-offset-2">
              открыть список заявок
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ── Секция «Письма не ушли» (DF-04, только мастер) ──────────────
// Карточка DF-04: «счётчик failed — в "Требует внимания"», критерий
// приёмки: «искусственно сломанный транспорт виден мастеру в списке и
// в "Требует внимания"». Счётчик приходит null'ом не-мастеру (журнал
// master-only) — секция рендерится только у мастера, и только когда
// есть что показать (как StageSection — сама скрывается на нуле).
export function NotificationsFailedSection({ count }: { count: number }) {
  if (count === 0) return null

  return (
    <Card className="border-destructive/40">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <MailX className="size-4 text-destructive" />
          Письма не ушли
          <Badge className="bg-destructive text-destructive-foreground border-transparent">
            {count}
          </Badge>
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Доставка не удалась после всех повторов (или канал был не настроен) — адресаты не получили письма
        </p>
      </CardHeader>
      <CardContent>
        <Link
          href="/admin/notifications"
          className="flex items-center gap-2 rounded-md border p-3 text-sm transition-colors hover:border-ring"
        >
          <span className="font-medium">Открыть журнал отправок</span>
          <span className="text-muted-foreground">разбор ошибок и кнопка «Повторить»</span>
        </Link>
      </CardContent>
    </Card>
  )
}

// ── Секция «Запросы без движения» ───────────────────────────────
export function StaleLeadsSection({ count, rows }: { count: number; rows: LeadAttention[] }) {
  if (count === 0) return null
  const hidden = count - rows.length

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <PauseCircle className="size-4 text-muted-foreground" />
          Запросы без движения
          <Badge variant="outline" className="bg-muted text-muted-foreground">
            {count}
          </Badge>
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Нет изменений дольше 3 дней — напомнить клиенту или закрыть отказом
        </p>
      </CardHeader>
      <CardContent className="grid gap-2">
        {rows.map((l) => (
          <Link
            key={l.leadId}
            href={`/admin/leads/${l.leadId}`}
            className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border p-3 transition-colors hover:border-ring"
          >
            <span className="min-w-40 flex-1 font-medium">{l.contactName}</span>
            <Badge variant="outline" className="text-xs text-muted-foreground">
              {LEAD_STATUS_LABELS[l.status] ?? l.status}
            </Badge>
            <span className="text-sm text-muted-foreground tabular-nums">
              {l.daysIdle} {daysWord(l.daysIdle)} без изменений
            </span>
            <span className="text-xs text-muted-foreground tabular-nums">
              отклик: {fmtDate(l.updatedAt)}
            </span>
          </Link>
        ))}
        {hidden > 0 && (
          <div className="text-xs text-muted-foreground text-center pt-1">
            И ещё {hidden} —{' '}
            <Link href="/admin/leads" className="underline underline-offset-2">
              открыть список запросов
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
