'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { History } from 'lucide-react'
import { ActivityEventList } from '../ActivityEventList'
import type { PulseEvent } from './types'

// ─── DF-07, блок 4 «Последние события» ───────────────────────────────
// До 20 событий за сутки с аудиторией staff (DF-01), ссылки на сделку.
// Тело ленты — общий ActivityEventList (правая панель главной рисует
// тот же список; подписи типов — один словарь). События приходят
// строками ISO из API.

export function PulseEventsBlock({ events }: { events: PulseEvent[] }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <History className="size-4 text-muted-foreground" />
          Последние события
          <span className="text-xs font-normal text-muted-foreground">за сутки</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-0 pb-3">
        <ActivityEventList items={events} />
      </CardContent>
    </Card>
  )
}
