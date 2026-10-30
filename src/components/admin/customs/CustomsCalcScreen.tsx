'use client'

import { useCallback, useEffect, useState } from 'react'
import { Calculator, History, Loader2, Pencil, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'
import { readApiResponse } from '@/lib/api-client'
import { CustomsCalcForm } from './CustomsCalcForm'
import { CustomsCalcResult, HistoryRow } from './CustomsCalcResult'
import type {
  CustomsCalcRow,
  EstimatePrefill,
  FreightSuggest,
} from './types'

// ─── DF-19: экран расчёта таможенных платежей в карточке сделки ──────
// Монтируется в карточках запроса (лида) и заявки (только сотрудники —
// API staff-only, D38). Три состояния карточки: пусто (первый расчёт),
// текущий расчёт (просмотр + правки) и история версий. Форма —
// редактируемый черновик (D40); пересчёт создаёт новую версию.

export function CustomsCalcScreen({
  targetType,
  targetId,
  estimates,
  initialIncoterm,
  initialPlace,
  freightSuggest,
  onChanged,
  compact,
}: {
  targetType: 'lead' | 'order'
  targetId: string
  estimates: EstimatePrefill[]
  initialIncoterm?: string | null
  initialPlace?: string | null
  freightSuggest?: FreightSuggest
  onChanged?: () => void
  // DF-21: режим правой панели 320px — формы в одну колонку, строки
  // расчёта стопкой (вьюпортные sm:/lg: сетки в узкой панели ломаются).
  compact?: boolean
}) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [calcs, setCalcs] = useState<CustomsCalcRow[]>([])
  const [formMode, setFormMode] = useState<'create' | 'edit' | null>(null)
  const [showHistory, setShowHistory] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/${targetType}s/${targetId}/customs-calculations`)
      const data = await readApiResponse<{ calculations?: CustomsCalcRow[]; error?: string }>(res)
      if (!res.ok) throw new Error(data.error || 'Ошибка загрузки')
      setCalcs(data.calculations ?? [])
    } catch (e) {
      toast({
        title: 'Не удалось загрузить расчёты',
        description: e instanceof Error ? e.message : '',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }, [targetType, targetId, toast])

  useEffect(() => {
    load()
  }, [load])

  const current = calcs.find((c) => c.isCurrent) ?? null
  const history = calcs.filter((c) => !c.isCurrent)

  const onDone = (): void => {
    setFormMode(null)
    load()
    onChanged?.()
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Calculator className="size-4 text-muted-foreground" />
          Расчёт таможенных платежей
        </CardTitle>
        <CardDescription>
          Оценка в рублях по условию поставки, стоимости, фрахту и курсу ЦБ — из справочников, не вручную (D38/D39)
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
            <Loader2 className="size-4 animate-spin" />
            Загрузка…
          </div>
        ) : formMode === 'create' || formMode === 'edit' ? (
          <CustomsCalcForm
            targetType={targetType}
            targetId={targetId}
            initial={formMode === 'edit' ? current : null}
            initialIncoterm={initialIncoterm}
            initialPlace={initialPlace}
            freightSuggest={freightSuggest ?? null}
            estimates={estimates}
            onDone={onDone}
            onCancel={() => setFormMode(null)}
            compact={compact}
          />
        ) : current ? (
          <div className="grid gap-3">
            <CustomsCalcResult calc={current} compact={compact} />
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => setFormMode('edit')}>
                <Pencil className="size-3.5" />
                Править расчёт
              </Button>
              <Button size="sm" variant="outline" onClick={() => setFormMode('create')}>
                <Plus className="size-3.5" />
                Пересчитать новой версией
              </Button>
              {history.length > 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setShowHistory((v) => !v)}
                  aria-expanded={showHistory}
                >
                  <History className="size-3.5" />
                  История ({history.length})
                </Button>
              )}
            </div>
            {showHistory && (
              <div className="rounded-md border px-2 py-1">
                {history.map((c) => (
                  <HistoryRow key={c.id} calc={c} />
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="grid gap-2">
            <div className="text-sm text-muted-foreground">
              Расчёта ещё нет — ответ брокера с кодами и процентами (DF-18) превращается в рубли по курсу ЦБ
            </div>
            <div>
              <Button size="sm" onClick={() => setFormMode('create')}>
                <Plus className="size-3.5" />
                Рассчитать платежи
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
