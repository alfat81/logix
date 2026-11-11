'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useToast, toastSaveError } from '@/hooks/use-toast'
import { readApiResponse } from '@/lib/api-client'
import { parseMoneyInput } from '@/lib/money'
import type { QuoteOptionRow } from '@/components/admin/QuoteOptionsSection'
import {
  QuoteOptionFormFields,
  EMPTY_OPTION_FORM,
} from '@/components/admin/QuoteOptionFormFields'
import {
  LeadSourceBlock,
  OptionRouteBlock,
  type LeadBlankView,
  type ProvenanceInfo,
} from '@/components/admin/QuoteOptionRouteBlocks'
import { OptionCargoBlock } from '@/components/admin/QuoteOptionCargoBlock'
import { QuoteOptionCalcLines } from '@/components/admin/QuoteOptionCalcLines'
import {
  EMPTY_ROUTE,
  EMPTY_CARGO,
  optionFormFromApi,
  provenanceFromApi,
  buildOptionSaveBody,
  type OptionDialogForm,
} from '@/components/admin/option-dialog-model'

// ─── DF-27 волна 1: диалог варианта блоками 1–6 (ТЗ §8; план §10) ──
// (1) исходные данные запроса — только чтение; (2) маршрут/транспорт +
// промежуточные точки + пожелания; (3) груз; (4) коммерческие условия и
// строки расчёта; (5) внутренняя экономика (D3); (6) предупреждения.
// Сборка формы и тела запроса — в option-dialog-model.ts (RULES 2.14).
// Overrides уходят в запрос ТОЛЬКО по тронутым полям (dirty-tracking):
// нетронутое поле = «как в запросе».

// Готовность запроса (вычисляемая, не хранимая) — приходит из GET
// карточки (staff-проекция completeness, ТЗ §2.3)
type CompletenessView = { ready: boolean; missing: string[] }

const emptyForm = (): OptionDialogForm => ({
  ...EMPTY_OPTION_FORM,
  route: { ...EMPTY_ROUTE },
  cargo: { ...EMPTY_CARGO },
  stops: [],
  lines: [],
  isPreliminary: false,
})

export function QuoteOptionDialog({
  open,
  onOpenChange,
  leadId,
  editing,
  leadBlank,
  leadCompleteness,
  onSaved,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  leadId: string
  editing: QuoteOptionRow | null
  leadBlank: LeadBlankView
  leadCompleteness?: CompletenessView | null
  onSaved: () => void
}) {
  const { toast } = useToast()
  const [form, setForm] = useState<OptionDialogForm>(emptyForm())
  const [provenance, setProvenance] = useState<ProvenanceInfo | null>(null)
  const [routeDirty, setRouteDirty] = useState<Set<string>>(new Set())
  const [cargoDirty, setCargoDirty] = useState<Set<string>>(new Set())
  const [stopsTouched, setStopsTouched] = useState(false)
  const [wishesTouched, setWishesTouched] = useState(false)
  const [saving, setSaving] = useState(false)
  const [missing, setMissing] = useState<string[]>([])

  const patchForm = (p: Partial<OptionDialogForm>) => setForm((f) => ({ ...f, ...p }))

  // Инициализация: правка — GET /api/admin/options/[id] (снимки, строки,
  // provenance); создание — пустая форма поверх бланка запроса
  useEffect(() => {
    if (!open) return
    setMissing([])
    setRouteDirty(new Set())
    setCargoDirty(new Set())
    setStopsTouched(false)
    setWishesTouched(false)
    if (!editing) {
      setProvenance(null)
      setForm(emptyForm())
      return
    }
    let alive = true
    fetch(`/api/admin/options/${editing.id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Не удалось загрузить вариант'))))
      .then((d) => {
        if (!alive) return
        setProvenance(provenanceFromApi(d))
        setForm((f) => optionFormFromApi(d, f))
      })
      .catch((e: unknown) => {
        if (alive) {
          toast({
            title: e instanceof Error ? e.message : 'Ошибка загрузки варианта',
            variant: 'destructive',
          })
          onOpenChange(false)
        }
      })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing])

  const markRoute = (key: string, patch: Partial<OptionDialogForm['route']>) => {
    patchForm({ route: { ...form.route, ...patch } })
    if (key === 'wishes') {
      setWishesTouched(true)
      return
    }
    setRouteDirty((d) => new Set(d).add(key))
  }
  const markCargo = (key: string, patch: Partial<OptionDialogForm['cargo']>) => {
    patchForm({ cargo: { ...form.cargo, ...patch } })
    setCargoDirty((d) => new Set(d).add(key))
  }

  const totals =
    form.lines.length > 0
      ? { total: form.lines.reduce((acc, l) => acc + (parseMoneyInput(l.amount) ?? 0), 0) }
      : null
  const cost = form.cost.trim() ? parseMoneyInput(form.cost) : null
  const mismatch = totals && cost !== null ? Math.round((totals.total - cost) * 100) / 100 : null
  const eff = leadCompleteness ?? { ready: false, missing: [] }

  const save = async () => {
    const built = buildOptionSaveBody(form, Boolean(editing), routeDirty, cargoDirty, stopsTouched, wishesTouched)
    if (built.error || !built.body) {
      toast({ title: built.error ?? 'Не удалось собрать вариант', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      const res = editing
        ? await fetch(`/api/admin/options/${editing.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(built.body),
          })
        : await fetch(`/api/admin/leads/${leadId}/options`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(built.body),
          })
      const data = await readApiResponse<{ message?: string; error?: string; missing?: string[] }>(res)
      if (!res.ok) {
        if (res.status === 422 && Array.isArray(data.missing)) setMissing(data.missing)
        throw new Error(data.error || 'Не удалось сохранить вариант')
      }
      toast({ title: data.message || 'Вариант расчёта сохранён' })
      onOpenChange(false)
      onSaved()
    } catch (e) {
      toastSaveError(e, toast)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? 'Править вариант' : 'Добавить вариант'}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-5">
          <LeadSourceBlock lead={leadBlank} />
          <OptionRouteBlock
            form={form.route}
            onChange={(p) => markRoute(Object.keys(p)[0], p)}
            provenance={provenance}
            stops={form.stops}
            onStopsChange={(stops) => {
              patchForm({ stops })
              setStopsTouched(true)
            }}
          />
          <OptionCargoBlock form={form.cargo} onChange={(p) => markCargo(Object.keys(p)[0], p)} provenance={provenance} />
          <div className="grid gap-4">
            <div className="text-xs font-medium text-muted-foreground">
              4. Коммерческие условия и расчёт
            </div>
            <QuoteOptionFormFields form={form} onChange={(p) => patchForm(p)} />
            <QuoteOptionCalcLines
              lines={form.lines}
              onChange={(lines) => patchForm({ lines })}
              offerCurrency={form.currency}
              totals={totals}
            />
            {mismatch !== null && mismatch !== 0 && (
              <div className="text-xs text-amber-600">
                5. Внутренняя экономика: сумма строк расчёта отличается от себестоимости на {mismatch}
              </div>
            )}
          </div>
          <div className="grid gap-1.5 rounded-md border bg-muted/30 p-3">
            <div className="text-xs font-medium text-muted-foreground">
              6. Недостающие сведения и предупреждения
            </div>
            {missing.length > 0 && (
              <div className="text-sm text-destructive">
                Недостающие данные: {missing.join(', ')}
              </div>
            )}
            {!editing && !eff.ready && eff.missing.length > 0 && (
              <div className="text-sm text-muted-foreground">
                По запросу не хватает: {eff.missing.join(', ')} — вариант сохранится как
                предварительный расчёт.
              </div>
            )}
            {editing && editing.priceReviewRequired && (
              <div className="text-sm text-amber-600">
                Данные запроса изменились — пересмотрите цену варианта.
              </div>
            )}
            {editing && editing.diffFromLead && editing.diffFromLead.length > 0 && (
              <div className="text-xs text-muted-foreground">
                Отличается от запроса: {editing.diffFromLead.map((d) => d.label).join(', ')}
              </div>
            )}
            {missing.length === 0 && (editing || eff.ready) && !editing?.priceReviewRequired && (
              <div className="text-sm text-muted-foreground">Критичных пробелов нет</div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="opt-preliminary"
              checked={form.isPreliminary}
              onCheckedChange={(v) => patchForm({ isPreliminary: v === true })}
            />
            <Label htmlFor="opt-preliminary" className="text-sm font-normal">
              Предварительный расчёт — не окончательная стоимость
            </Label>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            {editing ? 'Сохранить' : 'Добавить'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
