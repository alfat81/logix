'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { PERMIT_PROVIDER_LABELS, PERMIT_PROVIDERS } from '@/lib/permits'

// ─── DF-16: общие поля формы разрешительного (создание/правка) ───────
// Вынесено из PermitDialogs при резке под лимит 300 (RULES 2.14);
// потребитель передаёт контролы и префикс id (два диалога — один бланк).
const BLOCKING_LABELS = { yes: 'Блокирует отправку', no: 'Не блокирует' } as const

export function PermitFormFields(props: {
  title: string
  onTitle: (v: string) => void
  providedBy: string
  onProvidedBy: (v: string) => void
  blocking: string
  onBlocking: (v: string) => void
  neededBy: string
  onNeededBy: (v: string) => void
  staffNote: string
  onStaffNote: (v: string) => void
  isStaff: boolean
  idPrefix: string
}) {
  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor={`${props.idPrefix}-title`}>Название документа</Label>
        <Input
          id={`${props.idPrefix}-title`}
          value={props.title}
          onChange={(e) => props.onTitle(e.target.value)}
          placeholder="Фитосанитарный сертификат, разрешение СИТЕС…"
        />
      </div>
      <div className="grid gap-2">
        <Label>Кто предоставляет</Label>
        <Select value={props.providedBy} onValueChange={props.onProvidedBy}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PERMIT_PROVIDERS.map((p) => (
              <SelectItem key={p} value={p}>
                {PERMIT_PROVIDER_LABELS[p]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-2">
        <Label>Блокирует отправку</Label>
        <Select value={props.blocking} onValueChange={props.onBlocking}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="no">{BLOCKING_LABELS.no}</SelectItem>
            <SelectItem value="yes">{BLOCKING_LABELS.yes}</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Блокирующий без загруженного документа усыпляет отправку и даёт красное
          напоминание за несколько дней до срока.
        </p>
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${props.idPrefix}-due`}>Срок (необязательно)</Label>
        <Input
          id={`${props.idPrefix}-due`}
          type="date"
          value={props.neededBy}
          onChange={(e) => props.onNeededBy(e.target.value)}
        />
      </div>
      {props.isStaff && (
        <div className="grid gap-2">
          <Label htmlFor={`${props.idPrefix}-note`}>Внутренняя заметка (необязательно)</Label>
          <Textarea
            id={`${props.idPrefix}-note`}
            value={props.staffNote}
            onChange={(e) => props.onStaffNote(e.target.value)}
            placeholder="Видна только сотрудникам"
            rows={2}
          />
        </div>
      )}
    </div>
  )
}
