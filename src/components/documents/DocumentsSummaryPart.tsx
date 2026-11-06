'use client'

import { useCallback, useEffect, useState } from 'react'
import { FolderOpen, Loader2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import { readApiResponse } from '@/lib/api-client'
import { providerLabelFor } from '@/lib/permits'
import type { PermitLiteUi, SummaryUi } from './parts/registry-types'

// ─── DF-26 §3.2: сводка правой панели (320 px) — не каталог ──────────
// Данные — тот же package-роут, что у реестра (один источник): счётчик
// «выполнено D из Y» по обязательным позициям (§3.4), расшифровка
// тремя числами, разрешительные, «Требуют внимания» (красный — только
// блокирующая просрочка, не более двух красных строк, §3.5) и кнопка
// «Открыть все документы» → переключение основной области в реестр.

export function DocumentsSummaryPart({
  packageUrl,
  onOpenRegistry,
}: {
  packageUrl: string
  onOpenRegistry: () => void
}) {
  const { toast } = useToast()
  const [summary, setSummary] = useState<SummaryUi | null>(null)
  const [permits, setPermits] = useState<PermitLiteUi[]>([])
  const [loading, setLoading] = useState(true)
  // Точка сравнения просрочек — состояние (рендер чистый: Date.now()
  // нельзя вызывать во время рендера, правило impure-render).
  const [now, setNow] = useState<number>(() => 0)
  useEffect(() => {
    setNow(Date.now())
  }, [])

  const load = useCallback(async () => {
    try {
      const res = await fetch(packageUrl)
      const json = await readApiResponse<{
        summary?: SummaryUi
        permits?: PermitLiteUi[]
        error?: string
      }>(res)
      if (!res.ok) throw new Error(json.error || 'Ошибка загрузки')
      setSummary(json.summary ?? null)
      setPermits(json.permits ?? [])
    } catch (e) {
      toast({
        title: 'Не удалось загрузить сводку документов',
        description: e instanceof Error ? e.message : '',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [packageUrl])

  useEffect(() => {
    void load()
  }, [load])

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground text-sm py-4 justify-center">
        <Loader2 className="size-4 animate-spin" />
        Загрузка…
      </div>
    )
  }
  if (!summary) {
    return <p className="text-muted-foreground text-sm py-4 text-center">Сводка недоступна</p>
  }

  // «Требуют внимания»: блокирующие разрешительные без документа
  // (просрочка — красным, не более двух красных строк §3.5) и
  // недостающие блокирующие виды текущего этапа.
  const attentionPermits = permits
    .filter((p) => p.isBlocking && p.status === 'pending')
    .sort((a, b) => {
      const ad = a.neededBy ? new Date(a.neededBy).getTime() : Number.MAX_SAFE_INTEGER
      const bd = b.neededBy ? new Date(b.neededBy).getTime() : Number.MAX_SAFE_INTEGER
      return ad - bd
    })
  const overdueCount = attentionPermits.filter(
    (p) => p.neededBy && new Date(p.neededBy).getTime() < now,
  ).length

  return (
    <div className="grid gap-3">
      <div className="grid gap-1">
        <p className="text-2xl font-semibold leading-tight">
          Документы: {summary.requiredDone} из {summary.requiredTotal}
        </p>
        <p className="text-sm text-muted-foreground">
          на проверке {summary.requiredInReview} · не готово {summary.requiredMissing}
        </p>
        {(summary.permitsPending > 0 || summary.permitsSubmitted > 0) && (
          <p className="text-sm text-muted-foreground">
            Разрешительные: {summary.permitsPending} ожидаются
            {summary.permitsSubmitted > 0 ? ` · ${summary.permitsSubmitted} на проверке` : ''}
          </p>
        )}
      </div>

      {summary.nextStageBlockers.length > 0 && summary.currentStageName && (
        <div className="grid gap-1 border rounded-lg p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Для этапа «{summary.currentStageName}» нет
          </p>
          <p className="text-sm">{summary.nextStageBlockers.join(', ')}</p>
        </div>
      )}

      {(attentionPermits.length > 0 || summary.nextStageBlockers.length > 0) && (
        <div className="grid gap-1.5">
          <p className="text-sm font-semibold">Требуют внимания</p>
          {attentionPermits.slice(0, 5).map((p, i) => {
            const overdue = p.neededBy ? new Date(p.neededBy).getTime() < now : false
            const red = overdue && i < 2
            return (
              <div key={p.id} className="flex items-start gap-2 text-sm">
                {overdue && (
                  <Badge variant={red ? 'critical' : 'delay'} className="text-xs shrink-0">
                    ПРОСРОЧЕНО
                  </Badge>
                )}
                <span className={red ? 'text-destructive' : ''}>
                  «{p.title}»
                  {p.neededBy && ` — до ${fmtDate(p.neededBy)}`} · ожидается от{' '}
                  {providerLabelFor(p.providedBy, 'staff')}
                </span>
              </div>
            )
          })}
          {attentionPermits.length > 5 && (
            <p className="text-xs text-muted-foreground">
              и ещё {attentionPermits.length - 5} — в реестре
            </p>
          )}
          {overdueCount > 2 && (
            <p className="text-xs text-muted-foreground">
              Просрочено: {overdueCount} — остальные без выделения
            </p>
          )}
        </div>
      )}

      <Button className="w-full" onClick={onOpenRegistry}>
        <FolderOpen className="size-4" />
        Открыть все документы
      </Button>
    </div>
  )
}

function fmtDate(iso: string): string {
  const d = new Date(iso)
  const dd = String(d.getUTCDate()).padStart(2, '0')
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  return `${dd}.${mm}.${d.getUTCFullYear()}`
}
