'use client'

import { Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useApiData } from '@/hooks/use-api-data'
import { PulseCargoBlock } from './PulseCargoBlock'
import { PulseSlowingBlock } from './PulseSlowingBlock'
import { PulseEventsBlock } from './PulseEventsBlock'
import type { PulseData } from './types'

// ─── Экран «Пульс» мастера (DF-07) ───────────────────────────────────
// Мобильный-first (375 px — основной размер, Г1 ≤ 10 секунд): цифры →
// «Где груз» → «Кто тормозит» → «Последние события». Один запрос
// GET /api/admin/pulse на весь экран; обновление — кнопкой. Транспорт —
// общий хук useApiData (Ж5 использует его же; IC-14). Карточки — токены
// брендбука (bg-card, radius 12, muted-подписи), новых hex нет.
export function PulseScreen() {
  const { data, loading, refreshing, reload } = useApiData<PulseData>(
    '/api/admin/pulse',
    'Не удалось загрузить Пульс'
  )

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground text-sm py-16 justify-center">
        <Loader2 className="size-4 animate-spin" />
        Загрузка…
      </div>
    )
  }

  const s = data?.stats
  const stats: Array<{ value: number; label: string }> = [
    { value: s?.newLeads24h ?? 0, label: 'Новые запросы, 24 ч' },
    { value: s?.activeOrders ?? 0, label: 'Активные заявки' },
    { value: s?.inProgress ?? 0, label: 'В пути' },
    {
      value: s?.waitingOverThreshold ?? 0,
      label: `Ждут дольше ${s?.attentionHours ?? 24} ч`,
    },
    { value: s?.problemStages ?? 0, label: 'Этапы с проблемой' },
  ]

  const generatedAt = data?.generatedAt
    ? new Date(data.generatedAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
    : null

  return (
    <div className="grid gap-4">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-semibold">Пульс</h1>
        {generatedAt && (
          <span className="text-xs text-muted-foreground tabular-nums">на {generatedAt}</span>
        )}
        <Button
          variant="outline"
          size="sm"
          className="ml-auto"
          disabled={refreshing}
          onClick={reload}
        >
          <RefreshCw className={`size-4 ${refreshing ? 'animate-spin' : ''}`} />
          Обновить
        </Button>
      </div>

      {/* Блок 1 «Цифры»: 2 колонки на 375 px, 5 — на широком экране.
          Числа tabular-nums Medium (§6 брендбука), тона нейтральные. */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
        {stats.map((st) => (
          <Card key={st.label}>
            <CardContent className="px-4 py-3">
              <div className="text-2xl font-medium tabular-nums leading-none">{st.value}</div>
              <div className="text-xs text-muted-foreground mt-1.5">{st.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <PulseCargoBlock rows={data?.cargo ?? []} total={data?.cargoTotal ?? 0} />
      <PulseSlowingBlock groups={data?.slowing ?? []} />
      <PulseEventsBlock events={data?.events ?? []} />
    </div>
  )
}
