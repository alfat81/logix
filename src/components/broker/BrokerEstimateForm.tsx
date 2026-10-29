'use client'

import { useEffect, useState } from 'react'
import { CalendarClock, Loader2, Save, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import { readApiResponse } from '@/lib/api-client'
import { parseMoneyInput } from '@/lib/money'
import {
  EstimateItemsEditor,
  parsePercentInput,
  type ItemForm,
} from '@/components/broker/estimate/ItemsEditor'
import { PermitsEditor, DutyTotals } from '@/components/broker/estimate/FormBlocks'

// ─── Форма ответа брокера (Д, 5а; DF-18 — коды ТН ВЭД и проценты) ───
// Единственный write портала брокера. Форма короткая (D38): по каждому
// коду ТН ВЭД три процента + пометки, никаких полей Альты и ничего
// похожего на заполнение ДТ. Общая для карточки расчёта
// (/broker/leads/[id]) и карточки заявки (/broker/orders/[id] — оценка
// живёт на связи с лидом и переживает конвертацию). Сохранение — ПОЛНАЯ
// ЗАМЕНА (PUT): пустые поля обнуляются. «Отправить ответ» — статус sent
// (уведомление ответственному); правки после отправки — событие с
// разницей строк, статус обратно в черновик не раскрывается. Крупные
// блоки вынесены (RULES 2.14, ≤300 строк): строки — EstimateItemsEditor,
// разрешительные и сводка — FormBlocks.

export type BrokerEstimateItemRow = {
  hsCode: string
  isManualCode?: boolean
  dutyPercent: number | string | null
  addDutyPercent: number | string | null
  addDutyNote?: string | null
  vatPercent: number | string | null
  rateNote?: string | null
  sortOrder?: number
}

export type BrokerEstimate = {
  // P1-04: Decimal из API приходит строкой (раньше — число)
  customsDutyEstimate: number | string | null
  requiredPermits: string[]
  notes: string | null
  // DF-18: статус ответа и строки (старые ответы — undefined, поля опциональны)
  status?: string
  sentAt?: string | null
  items?: BrokerEstimateItemRow[]
  updatedAt?: string
}

type EstimateForm = {
  duty: string
  permits: string[]
  notes: string
  items: ItemForm[]
}

const EMPTY_FORM: EstimateForm = { duty: '', permits: [], notes: '', items: [] }

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
  const [sending, setSending] = useState(false)

  const sent = estimate?.status === 'sent'
  const busy = saving || sending

  // Предзаполнение при загрузке/обновлении оценки (props приходит из
  // карточки — после сохранения родитель перечитает и вернёт свежую).
  useEffect(() => {
    setForm({
      duty:
        estimate?.customsDutyEstimate === null || estimate?.customsDutyEstimate === undefined
          ? ''
          : String(estimate.customsDutyEstimate),
      permits: estimate?.requiredPermits ?? [],
      notes: estimate?.notes ?? '',
      items: (estimate?.items ?? []).map((i) => ({
        code: i.hsCode,
        codeName: '',
        duty: i.dutyPercent === null || i.dutyPercent === undefined ? '' : String(i.dutyPercent),
        addDuty:
          i.addDutyPercent === null || i.addDutyPercent === undefined ? '' : String(i.addDutyPercent),
        addDutyNote: i.addDutyNote ?? '',
        vat: i.vatPercent === null || i.vatPercent === undefined ? '' : String(i.vatPercent),
        rateNote: i.rateNote ?? '',
      })),
    })
  }, [estimate])

  // Сборка тела: null-проценты = «нет», rateNote — нестандартная ставка
  // (isManualRate — строка считается брокером вручную). Возвращает null
  // и показывает toast при ошибке валидации (сервер перепроверит).
  const buildBody = (mode: 'draft' | 'send') => {
    const duty = form.duty.trim() ? parseMoneyInput(form.duty) : null
    if (form.duty.trim() && (duty === null || duty < 0)) {
      toast({ title: 'Итог, ₽ — число, не меньше нуля, до 2 знаков', variant: 'destructive' })
      return null
    }
    const items: object[] = []
    for (let idx = 0; idx < form.items.length; idx++) {
      const it = form.items[idx]
      if (it.code.trim().length !== 10 || !/^\d{10}$/.test(it.code.trim())) {
        toast({
          title: `Строка ${idx + 1}: код ТН ВЭД — ровно 10 цифр (выберите из справочника)`,
          variant: 'destructive',
        })
        return null
      }
      const dutyP = parsePercentInput(it.duty)
      if (dutyP === 'invalid') {
        toast({ title: `Строка ${idx + 1}: пошлина — число 0…100, до 2 знаков`, variant: 'destructive' })
        return null
      }
      const addP = parsePercentInput(it.addDuty)
      if (addP === 'invalid') {
        toast({ title: `Строка ${idx + 1}: доп. пошлина — число 0…100, до 2 знаков`, variant: 'destructive' })
        return null
      }
      const vatP = parsePercentInput(it.vat)
      if (vatP === 'invalid') {
        toast({ title: `Строка ${idx + 1}: НДС — число 0…100, до 2 знаков`, variant: 'destructive' })
        return null
      }
      items.push({
        hsCode: it.code.trim(),
        dutyPercent: dutyP,
        addDutyPercent: addP,
        addDutyNote: it.addDutyNote.trim() || null,
        vatPercent: vatP,
        rateNote: it.rateNote.trim() || null,
      })
    }
    return {
      customsDutyEstimate: duty,
      requiredPermits: form.permits,
      notes: form.notes.trim() || null,
      items,
      send: mode === 'send',
    }
  }

  const save = async (mode: 'draft' | 'send') => {
    const body = buildBody(mode)
    if (!body) return
    // Два флага: блокируют все поля формы, спиннер — на нажатой кнопке
    if (mode === 'send') setSending(true)
    else setSaving(true)
    try {
      const res = await fetch(`/api/broker/leads/${leadId}/estimate`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await readApiResponse<{ message?: string; error?: string }>(res)
      if (!res.ok) throw new Error(data.error || 'Не удалось сохранить ответ')
      toast({ title: data.message || 'Ответ сохранён' })
      onSaved?.()
    } catch (e) {
      toast({
        title: 'Ошибка сохранения',
        description: e instanceof Error ? e.message : '',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
      setSending(false)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Ответ брокера — коды ТН ВЭД и проценты</CardTitle>
        <CardDescription>
          По каждому коду три процента из вашей Альты; сумму и НДС в рублях посчитает
          менеджер. Ставка из подсказки ЕТТ — только справка, вносите ставку из своей
          системы. {sent ? 'Ответ уже отправлен — правки уйдут менеджеру с разницей строк.' : 'Сначала можно сохранить черновик.'}
        </CardDescription>
        {sent && estimate?.sentAt && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <CalendarClock className="size-3" />
            отправлен {fmtDateTime(estimate.sentAt)}
          </span>
        )}
      </CardHeader>
      <CardContent className="grid gap-4">
        {/* Строки «код · пошлина % · доп. % · НДС %» */}
        <EstimateItemsEditor
          items={form.items}
          disabled={busy}
          onChange={(items) => setForm((f) => ({ ...f, items }))}
        />

        {/* Итог, ₽ + текущая оценка */}
        <DutyTotals
          duty={form.duty}
          disabled={busy}
          onDutyChange={(duty) => setForm((f) => ({ ...f, duty }))}
          dutyEstimate={estimate?.customsDutyEstimate ?? null}
          permitsCount={estimate?.requiredPermits?.length ?? 0}
          itemsCount={estimate?.items?.length ?? 0}
          updatedAt={estimate?.updatedAt}
        />

        {/* Разрешительные документы */}
        <PermitsEditor
          value={form.permits}
          disabled={busy}
          onChange={(permits) => setForm((f) => ({ ...f, permits }))}
        />

        <div className="grid gap-2">
          <Label htmlFor="est-notes">Комментарий</Label>
          <Textarea
            id="est-notes"
            rows={2}
            placeholder="Оговорки по ставкам, коду ТН ВЭД, условиям поставки…"
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            disabled={busy}
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {sent ? (
            // Правка отправленного: статус обратно не раскрывается —
            // сохранение уходит событием estimate_updated с разницей строк
            <Button onClick={() => save('send')} disabled={busy}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              Сохранить ответ
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => save('draft')} disabled={busy}>
                {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                Сохранить черновик
              </Button>
              <Button onClick={() => save('send')} disabled={busy}>
                {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                Отправить ответ
              </Button>
            </>
          )}
          <span className="text-xs text-muted-foreground">
            {sent
              ? 'Менеджер увидит разницу строк в ленте сделки'
              : 'После отправки менеджер получит уведомление'}
          </span>
        </div>
      </CardContent>
    </Card>
  )
}
