import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { stageVisual } from '@/lib/stage-visuals'
import type { OrderStatus } from '@/lib/order-constants'

// v0.3.1 (BRANDBOOK §4.3): степпер этапов на карточке заявки в списке.
// Круги с иконками + caps-подписи; состояния круга — по §4.3:
//   завершённый  — Success-заливка с белой галочкой;
//   текущий      — White с рамкой Coral и Coral-иконкой;
//   «проблема»   — рамка Brick (§5.3: ошибки и критичные задержки —
//                  Brick; дополнение агента, макет знает только три
//                  состояния — зафиксировано в отчёте v0.3.1);
//   будущий      — приглушённый серо-тёплый.
// Под степпером — тонкий прогресс-бар: трек Border-Sand, филл Coral;
// завершённая заявка — филл Success; расчётная — короткий нейтральный.
// Адаптив: при узком контейнере ряд прокручивается горизонтально
// (375px — ничего не выходит за экран, RULES 2.14).

export type StepperStage = { code: string; name: string; status: string }

const STAGE_CIRCLE_BASE =
  'flex size-7 shrink-0 items-center justify-center rounded-full'

function circleClasses(status: string, current: boolean): string {
  if (status === 'done') return cn(STAGE_CIRCLE_BASE, 'bg-success text-success-foreground')
  if (status === 'problem')
    return cn(STAGE_CIRCLE_BASE, 'border-2 border-destructive bg-card text-destructive')
  if (current) return cn(STAGE_CIRCLE_BASE, 'border-2 border-primary bg-card text-primary')
  return cn(STAGE_CIRCLE_BASE, 'border border-border bg-muted text-muted-foreground')
}

// Текущий этап: первый in_progress; если идущих нет — первый
// not_started (ближайшая точка работы — та же семантика, что у
// nearestStage в lib/orders.ts). not_started ПОСЛЕ текущего — будущий.
function currentIndex(stages: StepperStage[]): number {
  const inProgress = stages.findIndex((s) => s.status === 'in_progress')
  if (inProgress !== -1) return inProgress
  return stages.findIndex((s) => s.status === 'not_started')
}

export function OrderStepper({
  stages,
  orderStatus,
  className,
}: {
  stages: StepperStage[]
  orderStatus: OrderStatus
  className?: string
}) {
  if (!stages.length) return null
  const current = currentIndex(stages)
  const done = stages.filter((s) => s.status === 'done').length
  const pct = Math.round((done / stages.length) * 100)

  // Филл прогресс-бара: завершённая — Success; расчётная — короткий
  // нейтральный (макет §4.3); остальным — Coral по прогрессу.
  const fillClass =
    orderStatus === 'completed' ? 'bg-success' : orderStatus === 'calculating' ? 'bg-muted-foreground/40' : 'bg-primary'
  const barWidth = orderStatus === 'calculating' ? 8 : pct

  return (
    <div className={className}>
      <ol className="flex gap-2 overflow-x-auto pb-1" aria-label="Этапы заявки">
        {stages.map((s, i) => {
          const visual = stageVisual(s.code, s.name)
          const isDone = s.status === 'done'
          const Icon = isDone ? Check : visual.icon
          return (
            <li key={`${s.code}-${i}`} className="flex min-w-14 flex-1 flex-col items-center gap-1 text-center">
              <span className={circleClasses(s.status, i === current)}>
                <Icon className="size-3.5" aria-hidden />
              </span>
              <span
                className={cn(
                  'text-xs uppercase tracking-wide',
                  i === current ? 'font-medium text-foreground' : 'text-muted-foreground'
                )}
              >
                {visual.short}
              </span>
            </li>
          )
        })}
      </ol>
      <div
        className="h-1 overflow-hidden rounded-full bg-border"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Завершено этапов: ${done} из ${stages.length}`}
      >
        <div className={cn('h-full rounded-full', fillClass)} style={{ width: `${barWidth}%` }} />
      </div>
    </div>
  )
}
