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

// v0.3.1: тулбар поиска/сортировки списка заявок — выезд из
// OrdersList.tsx (318 → ≤ 300, RULES 2.14 / D15). Логика 1:1:
// лупа слева, сброс крестиком справа, сортировка Ж4 (эталонный
// паттерн списка); состояние живёт в родителе (fetchPage).

export function OrdersToolbar({
  q,
  onQChange,
  sort,
  onSortChange,
}: {
  q: string
  onQChange: (v: string) => void
  sort: string
  onSortChange: (v: string) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-56 flex-1">
        <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pr-8 pl-8"
          placeholder="Номер, клиент, телефон, ТН ВЭД…"
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
          <SelectItem value="newest">Сначала новые</SelectItem>
          <SelectItem value="oldest">Сначала старые</SelectItem>
          <SelectItem value="number_asc">№ по возрастанию</SelectItem>
          <SelectItem value="number_desc">№ по убыванию</SelectItem>
          <SelectItem value="stale">Давно без движения</SelectItem>
        </SelectContent>
      </Select>
    </div>
  )
}
