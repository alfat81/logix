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

// v0.4.0: тулбар поиска/сортировки списка лидов — зеркало
// OrdersToolbar (§4.2, эталон паттерна Ж4). Выезд из LeadsList.tsx
// (резка под лимит 300, RULES 2.14). Поиск: клиент, контакты,
// телефон, груз (API ?q=); сортировка — newest/stale (P1-01);
// состояние живёт в родителе.
export function LeadsToolbar({
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
          placeholder="Клиент, контакт, телефон, груз…"
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
          <SelectItem value="stale">Давно без движения</SelectItem>
        </SelectContent>
      </Select>
    </div>
  )
}
