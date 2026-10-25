import { REQUISITE_FIELDS } from '@/lib/requisite-fields'

// v0.5.0 (P1-22): типы и конвертеры реквизитов юрлица — выезд из
// LegalEntitiesList.tsx (резка под лимит 300, RULES 2.14). Json
// реквизитов свободный: поля формы описаны в REQUISITE_FIELDS,
// сохраняются только заполненные значения.

export type LegalEntityRow = {
  id: string
  name: string
  requisites: unknown
  isActive: boolean
  createdAt: string
  ordersCount: number
  contractsCount: number
}

export type LegalEntitiesPage = {
  legalEntities: LegalEntityRow[]
  hasMore: boolean
  counts: { all: number }
}

// Состояние формы реквизитов: Map «ключ → значение» по полям формы;
// пустые строки при отправке отбрасываются (Json не хранит пустышек).
export type RequisitesFormState = Record<string, string>

export function requisitesToForm(requisites: unknown): RequisitesFormState {
  const form: RequisitesFormState = {}
  if (requisites && typeof requisites === 'object' && !Array.isArray(requisites)) {
    for (const [key, value] of Object.entries(requisites as Record<string, unknown>)) {
      if (typeof value === 'string' || typeof value === 'number') form[key] = String(value)
    }
  }
  return form
}

export function formToRequisites(form: RequisitesFormState): Record<string, string> {
  const out: Record<string, string> = {}
  for (const field of REQUISITE_FIELDS) {
    const value = (form[field.key] ?? '').trim()
    if (value) out[field.key] = value
  }
  return out
}

export const LEGAL_ENTITY_SORTS = [
  { value: 'name_asc', label: 'Название А-Я' },
  { value: 'name_desc', label: 'Название Я-А' },
  { value: 'newest', label: 'Сначала новые' },
  { value: 'oldest', label: 'Сначала старые' },
]
