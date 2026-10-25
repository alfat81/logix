'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { REQUISITE_FIELDS } from '@/lib/requisite-fields'
import type { RequisitesFormState } from './types'

// v0.5.0 (P1-22): общая форма полей реквизитов для диалогов создания
// и правки юрлица — выезд из LegalEntitiesList.tsx (резка под лимит
// 300, RULES 2.14). Поля необязательны: в Json уходят только
// заполненные.
export function RequisitesFields({
  form,
  onChange,
  idPrefix,
}: {
  form: RequisitesFormState
  onChange: (updater: (prev: RequisitesFormState) => RequisitesFormState) => void
  idPrefix: string
}) {
  return (
    <>
      {REQUISITE_FIELDS.map((field) => (
        <div key={field.key} className="grid gap-2">
          <Label htmlFor={`${idPrefix}-${field.key}`}>{field.label}</Label>
          <Input
            id={`${idPrefix}-${field.key}`}
            inputMode={field.numeric ? 'numeric' : 'text'}
            placeholder={`${field.placeholder} — не обязателен`}
            value={form[field.key] ?? ''}
            onChange={(e) => onChange((prev) => ({ ...prev, [field.key]: e.target.value }))}
          />
        </div>
      ))}
    </>
  )
}
