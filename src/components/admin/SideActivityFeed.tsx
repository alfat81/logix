import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { History } from 'lucide-react'
import { ActivityEventList, type ActivityEventItem } from './ActivityEventList'

// ─── Правая панель «События» на главной админки (P1-18, BRANDBOOK §4) ──
// Третья колонка workspace (280 | 1fr | 320): свежая активность по всем
// сделкам — журнал (Ж2) в масштабе платформы. Серверный компонент:
// данные читаются в page.tsx одним запросом, интерактивности нет —
// клик уводит в карточку сделки, остальное живёт в её ленте.
// Тело ленты — общий ActivityEventList (его же использует Пульс, DF-07).

export type SideActivityItem = ActivityEventItem

export function SideActivityFeed({ items }: { items: SideActivityItem[] }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="size-4 text-muted-foreground" />
          События
        </CardTitle>
      </CardHeader>
      <CardContent className="px-0 pb-3">
        <ActivityEventList items={items} />
      </CardContent>
    </Card>
  )
}
