'use client'

import { Archive, ChevronDown, Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CardHeader, CardTitle } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { RegistryFilter, SummaryUi } from './registry-types'

// ─── DF-26 §3.3: шапка реестра — заголовок, скачивание, фильтры ─────
// Выезд из DocumentsRegistrySection (RULES 2.14: файл ≤ 300 строк).
// Меню «Скачать ▾»: финальные (GET, DF-13), все доступные (ZIP §8 —
// с постоянным предупреждением о черновиках/на проверке в пункте,
// §3.3.8), выбор строк чекбоксами; подтверждение — ZipScopeConfirmDialog.

export function RegistryHeader({
  orderNumber,
  summary,
  filter,
  onFilter,
  nonfinalCount,
  permitsCounter,
  selectMode,
  selectedCount,
  onToggleSelect,
  onDownloadSelected,
  onDownloadFinal,
  onDownloadAll,
  zipBusy,
  onBack,
}: {
  orderNumber: string | null
  summary: SummaryUi | null
  filter: RegistryFilter
  onFilter: (f: RegistryFilter) => void
  nonfinalCount: number
  permitsCounter: number
  selectMode: boolean
  selectedCount: number
  onToggleSelect: () => void
  onDownloadSelected: () => void
  onDownloadFinal: () => void
  onDownloadAll: () => void
  zipBusy: boolean
  onBack?: () => void
}) {
  return (
    <CardHeader className="pb-3 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <CardTitle className="text-base flex items-center gap-2 min-w-0">
          {onBack && (
            <Button size="icon" variant="ghost" onClick={onBack} aria-label="К заявке" className="shrink-0">
              <X className="size-4" />
            </Button>
          )}
          <span className="truncate">
            {orderNumber ? `Документы заявки ${orderNumber}` : 'Документы заявки'}
          </span>
        </CardTitle>
        {/* §3.6: цели ≥ 44 × 44 на 375 px (h-11), на десктопе — компактно */}
        <div className="flex items-center gap-2">
          {selectMode && selectedCount > 0 && (
            <Button size="sm" variant="outline" disabled={zipBusy} onClick={onDownloadSelected} className="h-11 md:h-8">
              <Archive className="size-4" />
              Скачать выбранные ({selectedCount})
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={onToggleSelect} className="h-11 md:h-8">
            {selectMode ? 'Отменить выбор' : 'Выбрать'}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" disabled={zipBusy} className="h-11 md:h-8">
                {zipBusy ? <Loader2 className="size-4 animate-spin" /> : <Archive className="size-4" />}
                Скачать
                <ChevronDown className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onDownloadFinal}>Финальные (ZIP)</DropdownMenuItem>
              <DropdownMenuItem onClick={onDownloadAll}>
                <span className="flex flex-col">
                  <span>Все доступные (ZIP)</span>
                  {nonfinalCount > 0 && (
                    <span className="text-xs text-muted-foreground normal-case">
                      может содержать черновики и документы на проверке ({nonfinalCount})
                    </span>
                  )}
                </span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap text-sm">
        {summary?.currentStageName && (
          <span className="text-muted-foreground">
            Текущий этап: <span className="font-medium text-foreground">{summary.currentStageName}</span>
          </span>
        )}
        {summary && summary.requiredTotal > 0 && (
          <span className="text-muted-foreground">
            {summary.requiredDone} из {summary.requiredTotal}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {(
          [
            ['all', 'Все документы'],
            ['permits', permitsCounter > 0 ? `Разрешительные ${permitsCounter}` : 'Разрешительные'],
            ['nonfinal', nonfinalCount > 0 ? `Черновики и на проверке ${nonfinalCount}` : 'Черновики и на проверке'],
          ] as Array<[RegistryFilter, string]>
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => onFilter(key)}
            className={`text-xs border rounded-full px-3 transition-colors h-11 md:py-1.5 md:h-auto ${
              filter === key
                ? 'bg-foreground text-background border-foreground'
                : 'text-muted-foreground hover:bg-muted/50'
            }`}
            aria-pressed={filter === key}
          >
            {label}
          </button>
        ))}
      </div>
    </CardHeader>
  )
}
