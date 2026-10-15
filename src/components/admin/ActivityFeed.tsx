'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Bot, History, Landmark, StickyNote, Truck, User, Users } from 'lucide-react'

// ─── Лента событий (Ж2) ────────────────────────────────────────────
// Одна и та же лента на карточках заявки и лида: «кто что сделал и
// когда». Данные приходят внутри GET карточки (order.activities /
// lead.activities, свежие сверху) — отдельного запроса ленте не нужно,
// она движется вместе с карточкой и после действий (PATCH-ответы
// обновляют состояние целиком).

export type ActivityRow = {
  id: string
  actorType: 'employee' | 'contractor' | 'client' | 'broker' | 'system'
  actorName: string
  type: string
  description: string
  // Ж3: заметки рисуются иначе (бейдж «Заметка», акцентная линия)
  isInternal?: boolean
  createdAt: string
}

// Момент события (не дата-план!) — локальное время браузера корректно.
const fmtDateTime = (iso: string): string =>
  new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

const ACTOR_META: Record<
  ActivityRow['actorType'],
  { label: string; icon: typeof User; badgeCls: string }
> = {
  employee: { label: 'Сотрудник', icon: User, badgeCls: 'bg-primary/10 text-primary' },
  contractor: { label: 'Подрядчик', icon: Truck, badgeCls: 'bg-warning/15 text-warning-foreground' },
  client: { label: 'Клиент', icon: Users, badgeCls: 'bg-info/15 text-info-foreground' },
  broker: { label: 'Брокер', icon: Landmark, badgeCls: 'bg-accent text-accent-foreground' },
  system: { label: 'Система', icon: Bot, badgeCls: 'bg-muted text-muted-foreground' },
}

export function ActivityFeed({
  activities,
  emptyText = 'Событий пока нет',
}: {
  activities: ActivityRow[]
  emptyText?: string
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <History className="size-4 text-muted-foreground" />
          Журнал событий
        </CardTitle>
      </CardHeader>
      <CardContent>
        {activities.length === 0 ? (
          <span className="text-muted-foreground text-sm">{emptyText}</span>
        ) : (
          <ol className="grid gap-3">
            {activities.map((a) => {
              const meta = ACTOR_META[a.actorType] ?? ACTOR_META.system
              const ActorIcon = meta.icon
              // Ж3: заметка — не хроника «что стало с заявкой», а живой
              // текст для своих: акцентная линия + бейдж, чтобы в ленте
              // отличалась от системных событий с одного взгляда.
              const isNote = a.type === 'note_added'
              return (
                <li
                  key={a.id}
                  className={`grid gap-0.5 text-sm border-l-2 pl-3 -ml-1 ${
                    isNote ? 'border-warning/60' : 'border-muted'
                  }`}
                >
                  <span className="text-xs text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1">
                    {fmtDateTime(a.createdAt)}
                    <Badge
                      variant="outline"
                      className={`gap-1 text-xxs border-transparent ${meta.badgeCls}`}
                    >
                      <ActorIcon className="size-3" />
                      {meta.label}
                    </Badge>
                    {isNote && (
                      <Badge
                        variant="outline"
                        className="gap-1 text-xxs border-transparent bg-warning/15 text-warning-foreground"
                      >
                        <StickyNote className="size-3" />
                        Заметка
                      </Badge>
                    )}
                    <span>{a.actorName}</span>
                  </span>
                  <span className="break-words">{a.description}</span>
                </li>
              )
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  )
}
