'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { BrokerForm } from './types'

// v0.5.0 (P1-22): общие поля формы брокера для диалогов создания и
// правки — выезд из BrokersList.tsx (резка под лимит 300, RULES 2.14).
// Телефон — логин портала (маска на вводе, нормализация на сервере);
// тумблер чипами — Switch-компонента в дизайн-системе проекта нет,
// паттерн чипов TRANSPORT_TYPES (В3).
export function BrokerFormFields({
  form,
  onChange,
  disabled,
  idPrefix,
  passwordPlaceholder,
}: {
  form: BrokerForm
  onChange: (updater: (prev: BrokerForm) => BrokerForm) => void
  disabled: boolean
  idPrefix: string
  passwordPlaceholder: string
}) {
  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-name`}>Название компании</Label>
        <Input
          id={`${idPrefix}-name`}
          placeholder="Например: ООО «Брок-Сервис»"
          value={form.companyName}
          onChange={(e) => onChange((f) => ({ ...f, companyName: e.target.value }))}
          disabled={disabled}
        />
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor={`${idPrefix}-phone`}>Телефон (логин)</Label>
          <Input
            id={`${idPrefix}-phone`}
            type="tel"
            placeholder="+7 900 000-00-00"
            value={form.phone}
            onChange={(e) => onChange((f) => ({ ...f, phone: e.target.value }))}
            disabled={disabled}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`${idPrefix}-pass`}>Пароль портала</Label>
          <Input
            id={`${idPrefix}-pass`}
            type="text"
            placeholder={passwordPlaceholder}
            value={form.password}
            onChange={(e) => onChange((f) => ({ ...f, password: e.target.value }))}
            disabled={disabled}
          />
        </div>
      </div>
      <div className="flex items-center justify-between rounded-lg border p-3">
        <div className="grid gap-0.5">
          <span className="text-sm font-medium">Штатный брокер</span>
          <span className="text-xs text-muted-foreground">
            Пометка для справочника — пока все привлечённые
          </span>
        </div>
        <Button
          type="button"
          size="sm"
          variant={form.isInHouse ? 'default' : 'outline'}
          onClick={() => onChange((f) => ({ ...f, isInHouse: !f.isInHouse }))}
          disabled={disabled}
        >
          {form.isInHouse ? 'Штатный' : 'Привлечённый'}
        </Button>
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-comment`}>Заметка</Label>
        <Textarea
          id={`${idPrefix}-comment`}
          rows={2}
          placeholder="Кто рекомендовал, зона работы…"
          value={form.comment}
          onChange={(e) => onChange((f) => ({ ...f, comment: e.target.value }))}
          disabled={disabled}
        />
      </div>
    </div>
  )
}
