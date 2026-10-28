// ─── DF-17: общие типы экрана справочников ──────────────────────────
// Вынесены из ReferencesScreen при разделении (лимит 300 строк
// компонента, RULES 2.14): типы нужны и списку, и диалогу правки.

export type RefRow = {
  id: string
  code: string
  name: string
  nameEn: string | null
  isActive: boolean
  sortOrder: number
  meta: unknown
}

export type RatesData = { date: string; items: { code: string; nominal: number; value: string }[] } | null

// Тело onSave диалога: при правке — id (код неизменяем), при добавлении — code.
export type RefDialogSave = {
  id?: string
  dir: string
  code?: string
  name: string
  nameEn: string | null
  isActive: boolean
  sortOrder: number
}
