'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Bot, Eye, History, Landmark, Lock, StickyNote, Truck, User, Users } from 'lucide-react'

// ─── Лента событий (Ж2) ────────────────────────────────────────────
// Одна и та же лента на карточках заявки и лида (и в кабинете клиента
// без служебных пометок — showVisibility=false): «кто что сделал и
// когда». Данные приходят внутри GET карточки (order.activities /
// lead.activities, свежие сверху) — отдельного запроса ленте не нужно,
// она движется вместе с карточкой и после действий (PATCH-ответы
// обновляют состояние целиком).
//
// DF-21: метка видимости у каждой записи — «видно клиенту» или
// «внутреннее» (макет экрана «Заявки»). Носитель — audience события
// (lib/audience.ts): в списке 'client' → «видно клиенту», иначе
// «внутреннее». Метка — только сотрудникам: клиентскую ленту она не
// интересует (клиент и так видит только свои события), помечать её
// там — шум.

export type ActivityRow = {
  id: string
  actorType: 'employee' | 'contractor' | 'client' | 'broker' | 'system'
  actorName: string
  type: string
  description: string
  // DF-01: аудитория события — носитель видимости (eventWhereFor)
  audience?: string[]
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
  // DF-20 (v1.3 §3.2): текст бейджей всегда тёмный — Coral-текст и белый
  // на светлых тинтах запрещены (2,0–2,4 к 1); пары — из брендбук-токенов.
  employee: { label: 'Сотрудник', icon: User, badgeCls: 'bg-secondary text-secondary-foreground' },
  contractor: { label: 'Подрядчик', icon: Truck, badgeCls: 'bg-muted text-muted-foreground' },
  client: { label: 'Клиент', icon: Users, badgeCls: 'bg-accent text-accent-foreground' },
  broker: { label: 'Брокер', icon: Landmark, badgeCls: 'bg-info/15 text-foreground' },
  system: { label: 'Система', icon: Bot, badgeCls: 'bg-border/40 text-muted-foreground' },
}

export function ActivityFeed({
  activities,
  emptyText = 'Событий пока нет',
  // DF-21: метки «видно клиенту / внутреннее» — только сотрудникам.
  showVisibility = false,
}: {
  activities: ActivityRow[]
  emptyText?: string
  showVisibility?: boolean
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
              const clientVisible = (a.audience ?? []).includes('client')
              return (
                <li
                  key={a.id}
                  className={`grid gap-0.5 text-sm border-l-2 pl-3 -ml-1 ${
                    isNote ? 'border-action-icon/60' : 'border-muted'
                  }`}
                >
                  <span className="text-xs text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1">
                    {fmtDateTime(a.createdAt)}
                    <Badge
                      variant="outline"
                      className={`gap-1 text-xs border-transparent ${meta.badgeCls}`}
                    >
                      <ActorIcon className="size-3" />
                      {meta.label}
                    </Badge>
                    {isNote && (
                      <Badge
                        variant="outline"
                        className="gap-1 text-xs border-transparent bg-warning/15 text-foreground"
                      >
                        <StickyNote className="size-3" />
                        Заметка
                      </Badge>
                    )}
                    {showVisibility &&
                      (clientVisible ? (
                        // «видно клиенту» — нейтральная пара с иконкой глаза
                        <Badge
                          variant="outline"
                          className="gap-1 text-xs border-transparent bg-accent/50 text-foreground"
                        >
                          <Eye className="size-3" />
                          видно клиенту
                        </Badge>
                      ) : (
                        // «внутреннее» — muted с замком (§3.3: без красного)
                        <Badge
                          variant="outline"
                          className="gap-1 text-xs border-transparent bg-muted text-muted-foreground"
                        >
                          <Lock className="size-3" />
                          внутреннее
                        </Badge>
                      ))}
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
