'use client'

import { useEffect, useState } from 'react'
import { CalendarClock, Loader2, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import { readApiResponse } from '@/lib/api-client'
import { fmtDuty } from '@/lib/brokers'

// ─── Форма оценки таможенных платежей (Д, роадмап 5а) ──────────────
// Единственный write портала брокера: (а) ожидаемый размер платежей
// и (б) список разрешительных документов. Общая для карточки расчёта
// (/broker/leads/[id]) и карточки заявки (/broker/orders/[id] — оценка
// живёт на связи с лидом и переживает конвертацию, заявка знает
// leadId). Сохранение — ПОЛНАЯ ЗАМЕНА (PUT): пустые поля обнуляются.

export type BrokerEstimate = {
  customsDutyEstimate: number | null
  requiredPermits: string[]
  notes: string | null
  updatedAt?: string
}

type EstimateForm = {
  duty: string
  permits: string[]
  permitDraft: string
  notes: string
}

const EMPTY_FORM: EstimateForm = { duty: '', permits: [], permitDraft: '', notes: '' }

const fmtDateTime = (iso: string | undefined): string =>
  iso
    ? new Date(iso).toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : ''

export function BrokerEstimateForm({
  leadId,
  estimate,
  onSaved,
}: {
  leadId: string
  estimate: BrokerEstimate | null
  onSaved?: () => void
}) {
  const { toast } = useToast()
  const [form, setForm] = useState<EstimateForm>({ ...EMPTY_FORM })
  const [saving, setSaving] = useState(false)

  // Предзаполнение при загрузке/обновлении оценки (props приходит из
  // карточки — после сохранения родитель перечитает и вернёт свежую)
  useEffect(() => {
    setForm({
      duty:
        typeof estimate?.customsDutyEstimate === 'number'
          ? String(estimate.customsDutyEstimate)
          : '',
      permits: estimate?.requiredPermits ?? [],
      permitDraft: '',
      notes: estimate?.notes ?? '',
    })
  }, [estimate])

  const addPermit = () => {
    const v = form.permitDraft.trim()
    if (!v) return
    if (form.permits.includes(v)) {
      toast({ title: 'Такой документ уже в списке', variant: 'destructive' })
      return
    }
    setForm((f) => ({ ...f, permits: [...f.permits, v], permitDraft: '' }))
  }

  const save = async () => {
    const duty = form.duty.trim() ? Number(form.duty.replace(/\s/g, '').replace(',', '.')) : null
    if (duty !== null && (!Number.isInteger(duty) || duty < 0)) {
      toast({
        title: 'Таможенные платежи — целое число рублей, не меньше нуля',
        variant: 'destructive',
      })
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/broker/leads/${leadId}/estimate`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customsDutyEstimate: duty,
          requiredPermits: form.permits,
          notes: form.notes.trim() || null,
        }),
      })
      const data = await readApiResponse<{ message?: string; error?: string }>(res)
      if (!res.ok) throw new Error(data.error || 'Не удалось сохранить оценку')
      toast({ title: data.message || 'Оценка сохранена' })
      onSaved?.()
    } catch (e) {
      toast({
        title: 'Ошибка сохранения',
        description: e instanceof Error ? e.message : '',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Оценка таможенных платежей</CardTitle>
        <CardDescription>
          Обязанность брокера с этапа расчёта: ожидаемый размер платежей и какие
          разрешительные документы потребуются. Сохранение заменяет оценку целиком;
          сумму можно уточнить и после создания заявки.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="est-duty">Платежи, ₽</Label>
            <Input
              id="est-duty"
              inputMode="numeric"
              placeholder="150000"
              value={form.duty}
              onChange={(e) => setForm((f) => ({ ...f, duty: e.target.value }))}
              disabled={saving}
            />
            <span className="text-xs text-muted-foreground">
              Ожидаемый размер таможенных платежей по анкете груза
            </span>
          </div>
          <div className="grid gap-2">
            <Label>Текущая оценка</Label>
            <div className="text-sm">
              <span className="font-semibold tabular-nums">{fmtDuty(estimate?.customsDutyEstimate)}</span>
              {estimate?.requiredPermits && estimate.requiredPermits.length > 0 && (
                <span className="text-muted-foreground">
                  {' '}
                  · документов: {estimate.requiredPermits.length}
                </span>
              )}
            </div>
            {estimate?.updatedAt && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <CalendarClock className="size-3" />
                обновлена {fmtDateTime(estimate.updatedAt)}
              </span>
            )}
            {!estimate && <span className="text-xs text-muted-foreground">ещё не сообщалась</span>}
          </div>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="est-permit">Разрешительные документы</Label>
          <div className="flex gap-2">
            <Input
              id="est-permit"
              placeholder="Например: Сертификат соответствия ТР ТС"
              value={form.permitDraft}
              onChange={(e) => setForm((f) => ({ ...f, permitDraft: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addPermit()
                }
              }}
              disabled={saving}
            />
            <Button type="button" variant="outline" onClick={addPermit} disabled={saving || !form.permitDraft.trim()}>
              Добавить
            </Button>
          </div>
          {form.permits.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {form.permits.map((p) => (
                <Badge key={p} variant="outline" className="gap-1 text-xs">
                  {p}
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-destructive"
                    disabled={saving}
                    onClick={() => setForm((f) => ({ ...f, permits: f.permits.filter((x) => x !== p) }))}
                    title="Убрать документ"
                  >
                    ×
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </div>

        <div className="grid gap-2">
          <Label htmlFor="est-notes">Комментарий</Label>
          <Textarea
            id="est-notes"
            rows={2}
            placeholder="Оговорки по ставкам, коду ТН ВЭД, условиям поставки…"
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            disabled={saving}
          />
        </div>

        <div className="flex items-center gap-3">
          <Button onClick={save} disabled={saving}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            Сохранить оценку
          </Button>
          <span className="text-xs text-muted-foreground">
            Менеджер увидит обновление в ленте сделки
          </span>
        </div>
      </CardContent>
    </Card>
  )
}
