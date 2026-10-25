'use client'

import { Search, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

// v0.5.0 (P1-22, BRANDBOOK §4.2): универсальный тулбар поиска/сортировки
// справочников — обобщение LeadsToolbar/OrdersToolbar (лупа, крестик
// сброса, Select сортировки). Placeholder и набор сортировок задаёт
// раздел; состояние живёт в родителе. OrdersToolbar/LeadsToolbar остаются
// как есть (лимит 300 соблюдён) — миграция на общий компонент, если
// понадобится, отдельным проходом.
export type ListSortOption = { value: string; label: string }

export function ListToolbar({
  q,
  onQChange,
  sort,
  onSortChange,
  placeholder,
  sorts,
}: {
  q: string
  onQChange: (v: string) => void
  sort: string
  onSortChange: (v: string) => void
  placeholder: string
  sorts: ListSortOption[]
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-56 flex-1">
        <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pr-8 pl-8"
          placeholder={placeholder}
          value={q}
          onChange={(e) => onQChange(e.target.value)}
        />
        {q && (
          <button
            type="button"
            aria-label="Очистить поиск"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
            onClick={() => onQChange('')}
          >
            <X className="size-4" />
          </button>
        )}
      </div>
      <Select value={sort} onValueChange={onSortChange}>
        <SelectTrigger className="w-52">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {sorts.map((s) => (
            <SelectItem key={s.value} value={s.value}>
              {s.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
