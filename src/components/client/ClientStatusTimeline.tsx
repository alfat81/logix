'use client'

import Link from 'next/link'
import { CalendarDays, Check, PackageOpen } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'

// TU-01.7 (волна 3): «Статусы в работе» — вертикальный таймлайн этапов
// последней активной заявки (референс clientcabinet.png, правая
// колонка). Данные — реальные stages заявки (DF-12), никаких
// демо-узлов; обещаний реального времени нет (исправление макета (б),
// реестр отклонений) — только фактические и плановые даты системы.
export type TimelineStage = {
  id: string
  name: string
  sequence: number
  status: 'not_started' | 'in_progress' | 'done' | 'problem'
  plannedDate: string | null
  actualDate: string | null
}

export type TimelineOrder = {
  id: string
  number: string
  stages: TimelineStage[]
}

const fmtDate = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleDateString('ru-RU') : ''

const STAGE_LABEL: Record<TimelineStage['status'], string> = {
  done: 'Завершено',
  in_progress: 'В работе',
  not_started: 'Ожидает',
  problem: 'Требует внимания',
}

export function ClientStatusTimeline({ order }: { order: TimelineOrder | null }) {
  if (!order) {
    return (
      <Card className="p-6">
        <div className="text-sm text-muted-foreground flex items-start gap-3">
          <PackageOpen className="size-5 shrink-0 opacity-50" />
          <div>
            <div className="font-medium text-foreground">Статусы в работе</div>
            <div className="mt-1">
              Активных заявок нет — этапы появятся здесь, как только менеджер
              оформит заявку по согласованному запросу.
            </div>
          </div>
        </div>
      </Card>
    )
  }

  return (
    <Card className="p-6">
      <CardContent className="p-0">
        <h3 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
          Статусы в работе
        </h3>
        <div className="mt-2 text-sm">
          Заявка{' '}
          <Link
            href={`/client/orders/${order.id}`}
            className="font-mono font-semibold underline decoration-2 underline-offset-4 hover:opacity-80"
          >
            {order.number}
          </Link>
        </div>
        <ol className="mt-5 relative">
          {order.stages.map((st, i) => {
            const last = i === order.stages.length - 1
            const date = st.actualDate ?? st.plannedDate
            const done = st.status === 'done'
            const current = st.status === 'in_progress' || st.status === 'problem'
            return (
              <li key={st.id} className="relative flex gap-4 pb-6">
                {!last && (
                  <span
                    aria-hidden="true"
                    className="absolute left-[11px] top-6 bottom-0 w-px bg-border"
                  />
                )}
                <span
                  aria-hidden="true"
                  className={`relative z-10 mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border-2 ${
                    done
                      ? 'bg-accent-strong border-accent-strong text-accent-strong-fg'
                      : current
                        ? 'border-accent-strong text-accent-strong bg-background'
                        : 'border-border bg-background text-muted-foreground'
                  }`}
                >
                  {done ? (
                    <Check className="size-3.5" />
                  ) : current ? (
                    <span className="size-2 rounded-full bg-accent-strong" />
                  ) : (
                    ''
                  )}
                </span>
                <div className="min-w-0">
                  <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                    {STAGE_LABEL[st.status]}
                    {date && (
                      <span className="inline-flex items-center gap-1 font-normal">
                        <CalendarDays className="size-3" />
                        {done ? fmtDate(st.actualDate) : `ожидается: ${fmtDate(st.plannedDate)}`}
                      </span>
                    )}
                  </div>
                  <div
                    className={`mt-1 text-sm font-medium ${current ? 'text-foreground' : done ? 'text-foreground' : 'text-muted-foreground'}`}
                  >
                    {st.name}
                  </div>
                </div>
              </li>
            )
          })}
        </ol>
      </CardContent>
    </Card>
  )
}
