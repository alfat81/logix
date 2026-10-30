'use client'

// ── Этапы заявки (P1-19: список + добавление из каталога; карточка
// этапа — StageCard.tsx, RULES 2.14) ─────────────────────────────────
// Каталог и пул подрядчиков грузятся здесь (нужны только этапам).
// Статусы — бейджи §3.2 (lib/status-badges.ts).
//
// v0.7.10 (DF-22): секция — эталонная обёртка Card (CardTitle
// text-base с иконкой, действие — CardAction в заголовке, как у
// брокеров) вместо голого h2 text-lg рядом с Card-секциями страницы.
import { useEffect, useState } from 'react'
import { Loader2, ListOrdered, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { readApiResponse } from '@/lib/api-client'
import { type CatalogRow, type PoolRow, type StageRow } from './types'
import { StageCard } from './StageCard'

export function OrderStages({
  orderId,
  stages,
  onChanged,
}: {
  orderId: string
  stages: StageRow[]
  onChanged: () => void
}) {
  const { toast } = useToast()
  const [catalog, setCatalog] = useState<CatalogRow[]>([])
  const [pool, setPool] = useState<PoolRow[]>([])
  const [busyStageId, setBusyStageId] = useState<string | null>(null)
  // Черновики плановых дат по этапам: коммит по blur (не по каждому
  // символу), откат — перезагрузкой карточки.
  const [plannedDrafts, setPlannedDrafts] = useState<Record<string, string>>({})
  const [addOpen, setAddOpen] = useState(false)
  const [addCode, setAddCode] = useState('')
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    if (!catalog.length) {
      fetch('/api/admin/stage-catalog')
        .then((r) => r.json())
        .then((d) => setCatalog(d.catalog ?? []))
        .catch(() => {})
    }
  }, [catalog.length])

  // Пул активных подрядчиков для селекта исполнителя (Г5): грузится
  // один раз — назначение происходит на каждом этапе, пул общий.
  useEffect(() => {
    if (!pool.length) {
      fetch('/api/admin/contractors?active=true')
        .then((r) => readApiResponse<{ contractors: PoolRow[] }>(r))
        .then((d) => setPool(d.contractors ?? []))
        .catch(() => {})
    }
  }, [pool.length])

  const patchStage = async (stageId: string, body: Record<string, unknown>) => {
    setBusyStageId(stageId)
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/stages/${stageId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await readApiResponse<{ message?: string; error?: string }>(res)
      if (!res.ok) {
        toast({ title: data.error || 'Ошибка', variant: 'destructive' })
        return
      }
      toast({ title: data.message || 'Этап обновлён' })
      onChanged()
    } catch {
      toast({ title: 'Сеть недоступна', variant: 'destructive' })
    } finally {
      setBusyStageId(null)
    }
  }

  const deleteStage = async (stageId: string, name: string) => {
    setBusyStageId(stageId)
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/stages/${stageId}`, {
        method: 'DELETE',
      })
      const data = await readApiResponse<{ error?: string }>(res)
      if (!res.ok) {
        // 403 «обязательный нельзя удалить» сюда не доходит теоретически
        // (кнопки нет), но сервер — источник правды, покажем как есть
        toast({ title: data.error || 'Не удалось удалить этап', variant: 'destructive' })
        return
      }
      toast({ title: `Этап «${name}» удалён` })
      onChanged()
    } finally {
      setBusyStageId(null)
    }
  }

  // Перестановка соседних необязательных этапов (роадмап, раздел 3):
  // порядок обязательного ядра фиксирован, порядок надстройки — на
  // усмотрение менеджера.
  const moveStage = async (stage: StageRow, dir: -1 | 1) => {
    const sorted = [...stages].sort((a, b) => a.sequence - b.sequence)
    const idx = sorted.findIndex((s) => s.id === stage.id)
    const target = sorted[idx + dir]
    if (!target || target.isMandatory || stage.isMandatory) return
    await Promise.all([
      patchStage(stage.id, { sequence: target.sequence }),
      patchStage(target.id, { sequence: stage.sequence }),
    ])
  }

  const addStage = async () => {
    if (!addCode) {
      toast({ title: 'Выберите этап', variant: 'destructive' })
      return
    }
    setAdding(true)
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/stages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stageCode: addCode }),
      })
      const data = await readApiResponse<{ stage: { stageCode: string }; error?: string }>(res)
      if (!res.ok) throw new Error(data.error || 'Не удалось добавить этап')
      toast({ title: `Этап «${data.stage.stageCode}» добавлен` })
      setAddOpen(false)
      setAddCode('')
      onChanged()
    } catch (e) {
      toast({
        title: 'Ошибка',
        description: e instanceof Error ? e.message : '',
        variant: 'destructive',
      })
    } finally {
      setAdding(false)
    }
  }

  // Плановая дата: черновик по этапу, коммит по blur.
  const plannedValue = (s: StageRow): string =>
    plannedDrafts[s.id] ?? (s.plannedDate ? s.plannedDate.slice(0, 10) : '')

  const commitPlanned = (s: StageRow) => {
    const draft = plannedValue(s)
    const orig = s.plannedDate ? s.plannedDate.slice(0, 10) : ''
    if (draft === orig) return
    // Дата-план — поле менеджера (Г4: факт ставит сервер при done).
    // Полная UTC-полночь: дата-семантика без сдвига между поясами.
    void patchStage(s.id, { plannedDate: draft ? `${draft}T00:00:00.000Z` : null })
  }

  // Что можно добавить: этапы каталога, которых ещё нет в заявке
  // (обязательные уже подставлены автоматически — в списке их не будет)
  const availableStages = catalog.filter(
    (c) => !stages.some((s) => s.stageCode === c.code)
  )

  const sorted = [...stages].sort((a, b) => a.sequence - b.sequence)

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <ListOrdered className="size-4 text-muted-foreground" />
          Этапы
        </CardTitle>
        <CardAction>
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
              <Plus className="size-4" />
              Добавить этап
            </Button>
            <DialogContent className="sm:max-w-sm">
              <DialogHeader>
                <DialogTitle>Добавить этап из каталога</DialogTitle>
                <DialogDescription>
                  Необязательные этапы поверх обязательного ядра. Обязательные уже
                  в заявке и удалить их нельзя.
                </DialogDescription>
              </DialogHeader>
              <Select value={addCode} onValueChange={setAddCode}>
                <SelectTrigger>
                  <SelectValue placeholder="Выберите этап" />
                </SelectTrigger>
                <SelectContent>
                  {availableStages.length === 0 ? (
                    <div className="text-sm text-muted-foreground px-2 py-3">
                      Все этапы каталога уже в заявке
                    </div>
                  ) : (
                    availableStages.map((c) => (
                      <SelectItem key={c.code} value={c.code}>
                        {c.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              <DialogFooter>
                <Button onClick={addStage} disabled={adding || !addCode}>
                  {adding && <Loader2 className="size-4 animate-spin" />}
                  Добавить
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-2">
        {sorted.map((s, i) => (
          <StageCard
            key={s.id}
            stage={s}
            busy={busyStageId === s.id}
            pool={pool}
            isFirst={i === 0}
            isLast={i === sorted.length - 1}
            prevMandatory={!!sorted[i - 1]?.isMandatory}
            nextMandatory={!!sorted[i + 1]?.isMandatory}
            plannedValue={plannedValue(s)}
            onPlannedDraft={(value) => setPlannedDrafts((d) => ({ ...d, [s.id]: value }))}
            onCommitPlanned={() => commitPlanned(s)}
            onPatchStage={(body) => void patchStage(s.id, body)}
            onMove={(dir) => void moveStage(s, dir)}
            onDelete={() => void deleteStage(s.id, s.name)}
          />
        ))}
      </CardContent>
    </Card>
  )
}
