'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, RefreshCw, RotateCcw } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ListTabs } from '@/components/admin/ListTabs'
import { useToast } from '@/hooks/use-toast'
import { readApiResponse } from '@/lib/api-client'
import { maskPII } from '@/lib/notifications/mask'

// ─── Журнал отправок (DF-04) ─────────────────────────────────────────
// Экран очереди писем для мастера: табы статусов (ListTabs — эталон
// BRANDBOOK §4.2), фильтр по получателю, поле ошибки доставки и кнопка
// «Повторить» для failed/skipped. Тела писем в списке маскируются
// (RULES 2.4 — телефоны/email, maskPII), полный текст — по клику:
// API отдаёт мастеру тело целиком, маска — чисто отображенческая.
//
// Счётчики табов — распределение найденного по статусам (GET counts,
// те же фильтры кроме статуса — таб не сужает сам себя).
type NotificationRow = {
  id: string
  recipientKind: string
  toAddress: string
  channel: string
  mode: string
  type: string
  subject: string
  body: string
  status: string
  attempts: number
  sentAt: string | null
  lastError: string | null
  providerId: string | null
  createdAt: string
}

type JournalData = {
  notifications: NotificationRow[]
  counts: Record<string, number>
}

const STATUS_TABS = [
  { key: 'all', label: 'Все' },
  { key: 'pending', label: 'Ждут' },
  { key: 'sent', label: 'Отправлены' },
  { key: 'failed', label: 'Ошибки' },
  { key: 'skipped', label: 'Пропущены' },
]

// v0.7.10 (DF-22): статусы — варианты бейджей §3.2 (delivered —
// успех-пара с точкой, critical — единственный сплошной красный,
// version — нейтральная пара) вместо до-DF-20 сплошных заливок.
const STATUS_BADGE: Record<string, { label: string; variant: 'delivered' | 'critical' | 'version' }> = {
  pending: { label: 'Ждёт', variant: 'version' },
  sent: { label: 'Отправлено', variant: 'delivered' },
  failed: { label: 'Ошибка', variant: 'critical' },
  skipped: { label: 'Пропущено', variant: 'version' },
}

const KIND_LABELS: Record<string, string> = {
  employee: 'Сотрудник',
  client: 'Клиент',
  broker: 'Брокер',
}

const MODE_LABELS: Record<string, string> = {
  immediate: 'сразу',
  regular: 'в окно',
  red: 'красное',
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function NotificationsJournal() {
  const { toast } = useToast()
  const [data, setData] = useState<JournalData | null>(null)
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('all')
  const [kind, setKind] = useState('')
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({ take: '200' })
      if (status !== 'all') params.set('status', status)
      if (kind) params.set('recipientKind', kind)
      const res = await fetch(`/api/admin/notifications?${params}`)
      const body = await readApiResponse<JournalData & { error?: string }>(res)
      if (!res.ok) throw new Error(body.error || 'Ошибка загрузки')
      setData(body)
    } catch (e) {
      toast({
        title: 'Не удалось загрузить журнал',
        description: e instanceof Error ? e.message : '',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }, [status, kind, toast])

  useEffect(() => {
    load()
  }, [load])

  const retry = useCallback(
    async (id: string) => {
      setBusyId(id)
      try {
        const res = await fetch(`/api/admin/notifications/${id}/retry`, { method: 'POST' })
        const body = await readApiResponse<{ ok?: boolean; error?: string }>(res)
        if (!res.ok) throw new Error(body.error || 'Ошибка повтора')
        toast({
          title: 'Поставлено в очередь',
          description: 'Письмо уйдёт ближайшим проходом диспетчера',
        })
        await load()
      } catch (e) {
        toast({
          title: 'Не удалось повторить отправку',
          description: e instanceof Error ? e.message : '',
          variant: 'destructive',
        })
      } finally {
        setBusyId(null)
      }
    },
    [load, toast]
  )

  const counts = data?.counts ?? {}
  const tabs = STATUS_TABS.map((t) => ({
    key: t.key,
    label: t.label,
    count: t.key === 'all' ? Object.values(counts).reduce((a, b) => a + b, 0) : (counts[t.key] ?? 0),
  }))

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Журнал отправок</h1>
        <div className="ml-auto">
          <Button size="sm" variant="outline" onClick={load}>
            <RefreshCw className="size-4" />
            Обновить
          </Button>
        </div>
      </div>
      <p className="text-sm text-muted-foreground -mt-2">
        Очередь писем: кто, когда и на какой адрес получал уведомления, ошибки доставки и
        повторы. Тела писем замаскированы (RULES 2.4) — полный текст по клику.
      </p>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <ListTabs tabs={tabs} active={status} onChange={setStatus} />
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value)}
          aria-label="Получатель"
          className="h-8 rounded-md border bg-card px-2 text-sm text-foreground"
        >
          <option value="">Все получатели</option>
          <option value="employee">Сотрудники</option>
          <option value="client">Клиенты</option>
          <option value="broker">Брокеры</option>
        </select>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm py-16 justify-center">
          <Loader2 className="size-4 animate-spin" />
          Загрузка…
        </div>
      ) : (data?.notifications.length ?? 0) === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          {status === 'failed'
            ? 'Ошибок доставки нет — все письма ушли или ждут отправки.'
            : status === 'skipped'
              ? 'Пропущенных писем нет — канал доставки настроен.'
              : 'Писем пока не было — очередь наполнится событиями сделок.'}
        </Card>
      ) : (
        <div className="grid gap-2">
          {data?.notifications.map((n) => {
            const badge = STATUS_BADGE[n.status] ?? {
              label: n.status,
              variant: 'version' as const,
            }
            const canRetry = n.status === 'failed' || n.status === 'skipped'
            const isOpen = expanded[n.id] ?? false
            return (
              <Card key={n.id} className="p-4 grid gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={badge.variant}>{badge.label}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {KIND_LABELS[n.recipientKind] ?? n.recipientKind}
                    {n.mode !== 'regular' && n.type !== 'digest' && ` · ${MODE_LABELS[n.mode] ?? n.mode}`}
                  </span>
                  <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                    {fmtDateTime(n.createdAt)}
                  </span>
                </div>
                <div className="text-sm font-medium">{n.subject}</div>
                <div className="text-xs text-muted-foreground break-all">
                  <span className="font-mono">{n.type}</span> · {n.toAddress}
                  {n.sentAt && ` · отправлено ${fmtDateTime(n.sentAt)}`}
                  {n.attempts > 0 && ` · попыток: ${n.attempts}`}
                </div>
                {n.lastError && (
                  <div className="text-sm text-destructive break-all">
                    Ошибка: {n.lastError}
                    {n.providerId && !n.providerId.startsWith('fake:') && ` (${n.providerId})`}
                  </div>
                )}
                <div
                  className={
                    isOpen
                      ? 'text-sm whitespace-pre-wrap break-words'
                      : 'text-sm text-muted-foreground whitespace-pre-wrap break-words line-clamp-2'
                  }
                >
                  {isOpen ? n.body : maskPII(n.body)}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setExpanded((s) => ({ ...s, [n.id]: !isOpen }))}
                  >
                    {isOpen ? 'Скрыть текст' : 'Показать полностью'}
                  </Button>
                  {canRetry && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busyId === n.id}
                      onClick={() => retry(n.id)}
                    >
                      {busyId === n.id ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <RotateCcw className="size-4" />
                      )}
                      Повторить
                    </Button>
                  )}
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
