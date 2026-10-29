'use client'

import { useState } from 'react'
import { CalendarClock } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'
import { fmtDuty } from '@/lib/brokers'

// ─── DF-18: блоки BrokerEstimateForm (вынесены по RULES 2.14) ───────
// Два переиспользуемых куска формы ответа брокера: редактор разрешительных
// документов (чипы, как в анкете груза) и блок «Итог, ₽ + текущая
// оценка». Оба controlled — состояние живёт в форме; пропсы минимальные
// (без типа BrokerEstimate) — чтобы не создавать цикл импортов.

// Разрешительные документы: ввод + «Добавить» + чипы с удалением.
// Список хранит форма (уходит в PUT), черновик ввода — локальный.
export function PermitsEditor({
  value,
  disabled,
  onChange,
}: {
  value: string[]
  disabled: boolean
  onChange: (permits: string[]) => void
}) {
  const { toast } = useToast()
  const [draft, setDraft] = useState('')

  const add = () => {
    const v = draft.trim()
    if (!v) return
    if (value.includes(v)) {
      toast({ title: 'Такой документ уже в списке', variant: 'destructive' })
      return
    }
    onChange([...value, v])
    setDraft('')
  }

  return (
    <div className="grid gap-2">
      <Label htmlFor="est-permit">Разрешительные документы</Label>
      <div className="flex gap-2">
        <Input
          id="est-permit"
          placeholder="Например: Сертификат соответствия ТР ТС"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add()
            }
          }}
          disabled={disabled}
        />
        <Button type="button" variant="outline" onClick={add} disabled={disabled || !draft.trim()}>
          Добавить
        </Button>
      </div>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {value.map((p) => (
            <Badge key={p} variant="outline" className="gap-1 text-xs">
              {p}
              <button
                type="button"
                className="text-muted-foreground hover:text-destructive"
                disabled={disabled}
                onClick={() => onChange(value.filter((x) => x !== p))}
                title="Убрать документ"
              >
                ×
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  )
}

// «Итог платежей, ₽» (необязательный ввод брокера) + текущая оценка
// (сумма/документы/коды/время) — сводка и ввод в одной сетке. Сводные
// числа форма считает сама (estimate приходит из API карточки).
export function DutyTotals({
  duty,
  disabled,
  onDutyChange,
  dutyEstimate,
  permitsCount,
  itemsCount,
  updatedAt,
}: {
  duty: string
  disabled: boolean
  onDutyChange: (value: string) => void
  dutyEstimate: number | string | null
  permitsCount: number
  itemsCount: number
  updatedAt?: string
}) {
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
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="grid gap-2">
        <Label htmlFor="est-duty">Итог платежей, ₽ (необязательно)</Label>
        <Input
          id="est-duty"
          inputMode="numeric"
          placeholder="150000"
          value={duty}
          onChange={(e) => onDutyChange(e.target.value)}
          disabled={disabled}
        />
        <span className="text-xs text-muted-foreground">
          «Итого, ₽» — если посчитали сами; иначе посчитает система по строкам
        </span>
      </div>
      <div className="grid gap-2">
        <Label>Текущая оценка</Label>
        <div className="text-sm">
          <span className="font-semibold tabular-nums">{fmtDuty(dutyEstimate)}</span>
          {permitsCount > 0 && <span className="text-muted-foreground"> · документов: {permitsCount}</span>}
          {itemsCount > 0 && <span className="text-muted-foreground"> · кодов: {itemsCount}</span>}
        </div>
        {updatedAt && (
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <CalendarClock className="size-3" />
            обновлена {fmtDateTime(updatedAt)}
          </span>
        )}
        {!dutyEstimate && permitsCount === 0 && itemsCount === 0 && !updatedAt && (
          <span className="text-xs text-muted-foreground">ещё не сообщалась</span>
        )}
      </div>
    </div>
  )
}
