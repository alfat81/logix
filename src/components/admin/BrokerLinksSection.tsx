'use client'

import { useCallback, useEffect, useState } from 'react'
import { Landmark, Loader2, Plus, UserX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { readApiResponse } from '@/lib/api-client'
import { BROKER_KIND_LABELS } from '@/lib/brokers'
import { EstimateView } from '@/components/admin/estimate/EstimateView'
import type { BrokerEstimateRow } from '@/components/admin/estimate/EstimateView'

// ─── Брокеры сделки: секция карточек лида и заявки (Д) ────────────
// Подключение/отключение (POST/DELETE /api/admin/{leads|orders}/[id]/
// brokers) и показ оценок таможенных платежей. Один компонент на оба
// контекста: у лида оценка живёт НА связи (link.estimate), у заявки —
// на связи лида-источника (estimatesByBrokerId, перенос при
// конвертации В4). Просмотр ответа брокера — EstimateView (DF-18,
// вынесен по RULES 2.14 — файл ≤ 300 строк); типы переэкспортируются,
// прежние точки импорта потребителей не менялись.

// Только BrokerEstimateRow нужен потребителям (order/types, страница
// заявки); BrokerEstimateItemRow живёт в EstimateView.
export type { BrokerEstimateRow } from '@/components/admin/estimate/EstimateView'

export type BrokerLinkRow = {
  id: string
  createdAt: string
  broker: {
    id: string
    companyName: string
    phone: string
    isActive: boolean
    isInHouse: boolean
  }
  // Только у связей лида (1:1 с BrokerEstimate)
  estimate?: BrokerEstimateRow | null
}

export function BrokerLinksSection({
  targetType,
  targetId,
  links,
  estimatesByBrokerId,
  disabled,
  onChanged,
  emptyText,
}: {
  targetType: 'lead' | 'order'
  targetId: string
  links: BrokerLinkRow[]
  // Оценки по brokerId (контекст заявки: с лида-источника)
  estimatesByBrokerId?: Record<string, BrokerEstimateRow>
  // Лид сконвертирован — сервер откажет 409, прячем и управление
  disabled?: boolean
  onChanged: () => void
  emptyText: string
}) {
  const { toast } = useToast()

  const [pool, setPool] = useState<{ id: string; companyName: string }[]>([])
  const [attachId, setAttachId] = useState('')
  const [busy, setBusy] = useState(false)

  const loadPool = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/brokers?active=true')
      const data = await readApiResponse<{
        brokers: { id: string; companyName: string }[]
        error?: string
      }>(res)
      if (!res.ok) throw new Error(data.error || 'Ошибка загрузки')
      setPool(data.brokers ?? [])
    } catch {
      /* селект просто останется пустым — не блокируем карточку */
    }
  }, [])

  useEffect(() => {
    loadPool()
  }, [loadPool])

  const attach = async () => {
    if (!attachId) {
      toast({ title: 'Выберите брокера', variant: 'destructive' })
      return
    }
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/${targetType}s/${targetId}/brokers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brokerId: attachId }),
      })
      const data = await readApiResponse<{ error?: string }>(res)
      if (!res.ok) throw new Error(data.error || 'Не удалось подключить брокера')
      toast({ title: 'Брокер подключён — доступ к сделке открыт' })
      setAttachId('')
      onChanged()
    } catch (e) {
      toast({
        title: 'Ошибка',
        description: e instanceof Error ? e.message : '',
        variant: 'destructive',
      })
    } finally {
      setBusy(false)
    }
  }

  const detach = async (brokerId: string) => {
    setBusy(true)
    try {
      const res = await fetch(
        `/api/admin/${targetType}s/${targetId}/brokers/${brokerId}`,
        { method: 'DELETE' }
      )
      const data = await readApiResponse<{ message?: string; error?: string }>(res)
      if (!res.ok) throw new Error(data.error || 'Не удалось отключить брокера')
      toast({ title: data.message || 'Брокер отключён' })
      onChanged()
    } catch (e) {
      toast({
        title: 'Ошибка',
        description: e instanceof Error ? e.message : '',
        variant: 'destructive',
      })
    } finally {
      setBusy(false)
    }
  }

  // Кого можно ещё подключить: активные брокеры не из уже подключённых
  const attachedIds = new Set(links.map((l) => l.broker.id))
  const available = pool.filter((b) => !attachedIds.has(b.id))

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Landmark className="size-4 text-muted-foreground" />
          Брокеры {targetType === 'lead' ? 'расчёта' : 'сделки'}
        </CardTitle>
        <CardDescription>
          {targetType === 'lead'
            ? 'Консультируют сделку с этапа расчёта: сообщают таможенные платежи и разрешительные документы. При конвертации доступ переезжает в заявку.'
            : 'Видят заявку целиком — статусы всех этапов и оценку платежей. Подключение после конвертации — прямое, без оценки (расчёт уже прошёл).'}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {links.length === 0 ? (
          <span className="text-muted-foreground text-sm">{emptyText}</span>
        ) : (
          <div className="grid gap-2">
            {links.map((l) => {
              // У лида оценка на связи; у заявки — через лид-источник
              const estimate = l.estimate ?? estimatesByBrokerId?.[l.broker.id] ?? null
              return (
                <div
                  key={l.id}
                  className="rounded-lg border p-3 grid gap-2 bg-card"
                >
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="font-medium">{l.broker.companyName}</span>
                    <Badge variant="outline" className="text-xs text-muted-foreground">
                      {l.broker.isInHouse ? BROKER_KIND_LABELS.in_house : BROKER_KIND_LABELS.external}
                    </Badge>
                    {!l.broker.isActive && (
                      <Badge
                        variant="outline"
                        className="text-xs bg-destructive/10 text-destructive border-transparent"
                      >
                        деактивирован
                      </Badge>
                    )}
                    <span className="text-xs text-muted-foreground font-mono">{l.broker.phone}</span>
                    {!disabled && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 ml-auto text-destructive hover:text-destructive"
                        disabled={busy}
                        onClick={() => detach(l.broker.id)}
                        title="Отключить — видимость сделки закрывается"
                      >
                        <UserX className="size-3.5" />
                        Отключить
                      </Button>
                    )}
                  </div>
                  {estimate ? (
                    <EstimateView estimate={estimate} />
                  ) : (
                    <div className="text-xs text-muted-foreground border-t pt-2">
                      {targetType === 'order'
                        ? 'Оценки нет: подключён после расчёта или без связи с запросом'
                        : 'Оценку платежей ещё не сообщал'}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {!disabled && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {pool.length === 0 ? (
              <span className="text-xs text-muted-foreground">
                Справочник брокеров пуст — заведите первого в разделе «Брокеры»
              </span>
            ) : available.length === 0 ? (
              <span className="text-xs text-muted-foreground">
                Все действующие брокеры уже подключены
              </span>
            ) : (
              <>
                <Select value={attachId} onValueChange={setAttachId} disabled={busy}>
                  <SelectTrigger size="sm" className="w-64">
                    <SelectValue placeholder="Выберите брокера" />
                  </SelectTrigger>
                  <SelectContent>
                    <div className="max-h-64 overflow-y-auto">
                      {available.map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.companyName}
                        </SelectItem>
                      ))}
                    </div>
                  </SelectContent>
                </Select>
                <Button size="sm" variant="outline" onClick={attach} disabled={busy || !attachId}>
                  {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                  Подключить
                </Button>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
