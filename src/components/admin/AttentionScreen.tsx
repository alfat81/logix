'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  AlertTriangle,
  AlertOctagon,
  CheckCircle2,
  Loader2,
  UserX,
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import { readApiResponse } from '@/lib/api-client'
import { StageSection, StaleLeadsSection } from './attention/AttentionSections'
import type { AttentionData } from './attention/types'

// ─── Экран «Требует внимания» (Ж5) ─────────────────────────────
// Главная страница кабинета: сводка того, что требует реакции менеджера
// — просрочка, проблемы, неназначенные исполнители, запросы без движения.
// Список заявок переехал на /admin/orders, список запросов — /admin/leads.
//
// v0.5.0 (P1-22): секции и типы — выезд в attention/ (резка под лимит
// 300, RULES 2.14).
export function AttentionScreen() {
  const { toast } = useToast()
  const [data, setData] = useState<AttentionData | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/attention')
      const body = await readApiResponse<AttentionData & { error?: string }>(res)
      if (!res.ok) throw new Error(body.error || 'Ошибка загрузки')
      setData(body)
    } catch (e) {
      toast({
        title: 'Не удалось загрузить сводку',
        description: e instanceof Error ? e.message : '',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    load()
  }, [load])

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground text-sm py-16 justify-center">
        <Loader2 className="size-4 animate-spin" />
        Загрузка…
      </div>
    )
  }

  const counts = data?.counts ?? { overdue: 0, problem: 0, unassigned: 0, staleLeads: 0 }
  const total = counts.overdue + counts.problem + counts.unassigned + counts.staleLeads

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Требует внимания</h1>
        {total > 0 ? (
          <Badge className="bg-destructive text-destructive-foreground border-transparent">
            {total}
          </Badge>
        ) : (
          <Badge className="bg-success text-success-foreground border-transparent">чисто</Badge>
        )}
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="outline" onClick={load}>
            Обновить
          </Button>
        </div>
      </div>
      <p className="text-sm text-muted-foreground -mt-2">
        Просроченные этапы, проблемы, неназначенные исполнители и запросы без движения —
        всё, что ждёт реакции. Список заявок живёт в разделе «Заявки».
      </p>

      {total === 0 ? (
        <Card className="p-8 text-center">
          <CheckCircle2 className="size-8 text-success mx-auto mb-3" />
          <div className="font-medium">Всё под контролем</div>
          <div className="text-sm text-muted-foreground mt-1">
            Ни просрочек, ни проблем, ни зависших запросов. Хорошая работа.
          </div>
          <div className="flex justify-center gap-2 mt-4">
            <Button size="sm" variant="outline" asChild>
              <Link href="/admin/orders">К заявкам</Link>
            </Button>
            <Button size="sm" variant="outline" asChild>
              <Link href="/admin/leads">К запросам</Link>
            </Button>
          </div>
        </Card>
      ) : (
        <>
          <StageSection
            title="Просроченные этапы"
            subtitle="План прошёл, этап не завершён"
            icon={<AlertTriangle className="size-4 text-destructive" />}
            count={counts.overdue}
            rows={data?.overdueStages ?? []}
            tone="destructive"
          />
          <StageSection
            title="Этапы с проблемой"
            subtitle="Статус «Проблема» — требуют разбора"
            icon={<AlertOctagon className="size-4 text-destructive" />}
            count={counts.problem}
            rows={data?.problemStages ?? []}
            tone="destructive"
          />
          <StageSection
            title="Не назначен исполнитель"
            subtitle="Ближайший этап активной заявки ждёт подрядчика"
            icon={<UserX className="size-4 text-warning-foreground" />}
            count={counts.unassigned}
            rows={data?.unassignedStages ?? []}
            tone="warning"
          />
          <StaleLeadsSection
            count={counts.staleLeads}
            rows={data?.staleLeads ?? []}
          />
        </>
      )}
    </div>
  )
}
