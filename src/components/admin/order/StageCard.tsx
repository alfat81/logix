'use client'

// Карточка одного этапа заявки (P1-19: вынесена из OrderStages —
// RULES 2.14). Статус — бейдж §3.2; смена статуса, исполнитель (Г5),
// плановая дата (Г4: черновик в родителе, коммит по blur).
import { CalendarDays, CheckCircle2, ChevronDown, ChevronUp, Lock, Trash2, Truck, UserX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { STAGE_STATUSES, STAGE_STATUS_LABELS } from '@/lib/order-constants'
import { STAGE_BADGE_VARIANTS } from '@/lib/status-badges'
import { fmtDate, type PoolRow, type StageRow } from './types'

function StageBadge({ status }: { status: StageRow['status'] }) {
  return <Badge variant={STAGE_BADGE_VARIANTS[status]}>{STAGE_STATUS_LABELS[status]}</Badge>
}

export function StageCard({
  stage: s,
  busy,
  pool,
  isFirst,
  isLast,
  prevMandatory,
  nextMandatory,
  plannedValue,
  onPlannedDraft,
  onCommitPlanned,
  onPatchStage,
  onMove,
  onDelete,
}: {
  stage: StageRow
  busy: boolean
  pool: PoolRow[]
  isFirst: boolean
  isLast: boolean
  prevMandatory: boolean
  nextMandatory: boolean
  plannedValue: string
  onPlannedDraft: (value: string) => void
  onCommitPlanned: () => void
  // Единая точка PATCH этапа (статус/исполнитель/последовательность)
  onPatchStage: (body: Record<string, unknown>) => void
  onMove: (dir: -1 | 1) => void
  onDelete: () => void
}) {
  // Исполнитель этапа (Г5): селект из активного пула. Назначенному-
  // исключённому — особый пункт с пометкой: назначение остаётся
  // видимым (мягкое исключение не рвёт текущее), но выбрать его заново
  // нельзя — сервер ответит 409 (Г3).
  const options: PoolRow[] = [...pool]
  if (s.contractor && !options.some((p) => p.id === s.contractor!.id)) {
    options.push({
      id: s.contractor.id,
      companyName: s.contractor.companyName,
      phone: s.contractor.phone,
      isActive: s.contractor.isActive,
    })
  }

  return (
    <Card
      className={
        s.isMandatory
          ? 'p-4 border-l-4 border-l-primary/70'
          : 'p-4 border-l-4 border-l-transparent'
      }
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold tabular-nums">
          {s.sequence}
        </div>
        <div className="min-w-44 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium">{s.name}</span>
            {s.isMandatory ? (
              <Badge variant="outline" className="gap-1 text-xs">
                <Lock className="size-3" />
                обязательный
              </Badge>
            ) : (
              <Badge variant="outline" className="text-xs text-muted-foreground">
                дополнительный
              </Badge>
            )}
          </div>
          <div className="text-xs text-muted-foreground flex items-center gap-3 mt-0.5">
            <span className="flex items-center gap-1">
              <CheckCircle2 className="size-3" />
              факт: {fmtDate(s.actualDate)}
            </span>
          </div>
        </div>

        <StageBadge status={s.status} />

        <Select
          value={s.status}
          onValueChange={(v) => onPatchStage({ status: v })}
          disabled={busy}
        >
          <SelectTrigger size="sm" className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STAGE_STATUSES.map((st) => (
              <SelectItem key={st} value={st}>
                {STAGE_STATUS_LABELS[st]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-1">
          {!s.isMandatory && (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                disabled={busy || isFirst || prevMandatory}
                onClick={() => onMove(-1)}
                title="Выше (только среди дополнительных)"
              >
                <ChevronUp className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                disabled={busy || isLast || nextMandatory}
                onClick={() => onMove(1)}
                title="Ниже (только среди дополнительных)"
              >
                <ChevronDown className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-8 text-destructive hover:text-destructive"
                disabled={busy}
                onClick={onDelete}
                title="Удалить этап"
              >
                <Trash2 className="size-4" />
              </Button>
            </>
          )}
        </div>
      </div>

      {/* ── Исполнитель + плановая дата (Г5, назначение из Г3) ── */}
      <div className="flex flex-wrap items-center gap-3 pt-2 mt-1 border-t">
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Truck className="size-3.5" />
          Исполнитель
        </span>
        {pool.length === 0 && !s.contractor ? (
          <span className="text-xs text-muted-foreground">
            Пул пуст — назначать некого
          </span>
        ) : (
          <>
            <Select
              value={s.contractor?.id ?? ''}
              onValueChange={(v) => onPatchStage({ contractorId: v })}
              disabled={busy}
            >
              <SelectTrigger size="sm" className="w-60">
                <SelectValue placeholder="Не назначен" />
              </SelectTrigger>
              <SelectContent>
                <div className="max-h-64 overflow-y-auto">
                  {options.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.companyName}
                      {!p.isActive ? ' · исключён' : ''}
                    </SelectItem>
                  ))}
                </div>
              </SelectContent>
            </Select>
            {s.contractor && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-destructive hover:text-destructive"
                disabled={busy}
                // Снятие статус этапа не трогает (Г3): только исполнитель.
                onClick={() => onPatchStage({ contractorId: null })}
                title="Снять подрядчика — назначение убирается, статус этапа не меняется"
              >
                <UserX className="size-3.5" />
                Снять
              </Button>
            )}
          </>
        )}
        <div className="flex items-center gap-1.5 ml-auto">
          <CalendarDays className="size-3.5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">План</span>
          <Input
            type="date"
            className="h-7 w-36 text-xs"
            value={plannedValue}
            onChange={(e) => onPlannedDraft(e.target.value)}
            onBlur={onCommitPlanned}
            disabled={busy}
          />
        </div>
      </div>
    </Card>
  )
}
