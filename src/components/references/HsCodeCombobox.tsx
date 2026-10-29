'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { Loader2, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ComboOptionRow } from '@/components/references/ComboOptionRow'

// ─── DF-17C: Combobox справочника ТН ВЭД (серверный поиск) ───────────
// Отличие от ReferenceCombobox (DF-17): 13 294 позиции не грузим целиком
// — поиск идёт на сервере (/api/hs/search): цифровой запрос — префикс
// кода («0101», «0101 21»), иначе — вхождение в наименование; debounce
// 300 мс, отмена устаревших запросов. Клавиатура (стрелки/Enter/Esc),
// клик вне, 375 px (список на всю ширину поля).
//
// Значение — 10-значный код ТН ВЭД. Ставка ЕТТ показывается СПРАВА как
// подсказка и НЕ подставляется в формы расчёта: брокер вносит ставку из
// своей Альты (карточка DF-17C, DF-18). Клиент этот Combobox не видит —
// он даёт описание товара и видит код read-only.
//
// Выбранное отображается под полем: код · наименование · ставка —
// так менеджер и брокер видят, ЧТО именно выбрано, не открывая список.

export type HsPick = { code: string; name: string; etdDutyText: string | null }

type HsOption = HsPick

export function HsCodeCombobox({
  value,
  valueName,
  onPick,
  label,
  placeholder = 'Код или название товара…',
  disabled = false,
  className,
  allowManual = false,
}: {
  // Выбранный код (10 цифр) или '' если ничего не выбрано
  value: string
  // Наименование выбранного кода (хранит у себя форма из onPick)
  valueName?: string
  onPick: (pick: HsPick | null) => void
  label?: string
  placeholder?: string
  disabled?: boolean
  className?: string
  // DF-18: разрешить взять код, которого нет в справочнике (брокер
  // уверен в коде из своей Альты). Псевдо-пункт появляется, когда
  // запрос — ровно 10 цифр; сервер всё равно перепроверит по
  // справочнику и пометит isManualCode по факту.
  allowManual?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [options, setOptions] = useState<HsOption[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [active, setActive] = useState(0)
  const boxRef = useRef<HTMLDivElement | null>(null)
  const listId = useId()

  // Серверный поиск с debounce и отменой: запросы могут приходить в
  // произвольном порядке — фиксируем только последний.
  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    const t = setTimeout(() => {
      setLoading(true)
      setError(null)
      fetch(`/api/hs/search?q=${encodeURIComponent(query)}&limit=20`, { signal: controller.signal })
        .then(async (res) => {
          const body = await res.json().catch(() => ({}))
          if (!res.ok) throw new Error(body.error || 'Справочник недоступен')
          setOptions(body.items ?? [])
          setActive(0)
        })
        .catch((e) => {
          if (e instanceof DOMException && e.name === 'AbortError') return
          setError(e instanceof Error ? e.message : 'Ошибка поиска')
          setOptions([])
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false)
        })
    }, 300)
    return () => {
      controller.abort()
      clearTimeout(t)
    }
  }, [query, open])

  // Закрытие по клику вне (Escape — в keydown поля)
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const pick = (item: HsOption) => {
    onPick(item)
    setOpen(false)
    setQuery('')
  }

  // DF-18: запрос — ровно 10 цифр → предлагаем взять как есть
  // (ручной код). Режим включают формы, где код важнее справочника.
  const trimmedQuery = query.trim()
  const manualCandidate =
    allowManual && open && /^\d{10}$/.test(trimmedQuery) ? trimmedQuery : null

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        e.preventDefault()
        setOpen(true)
      }
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => Math.min(a + 1, Math.max((options?.length ?? 1) - 1, 0)))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(a - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const item = options?.[active]
      if (item) pick(item)
      else if (manualCandidate) pick({ code: manualCandidate, name: '', etdDutyText: null })
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setOpen(false)
    }
  }

  return (
    <div className={`grid gap-1.5 ${className ?? ''}`} ref={boxRef}>
      {label && <Label className="text-xs text-muted-foreground">{label}</Label>}
      <div className="relative">
        <div className="flex items-center gap-2 rounded-md border border-input bg-card px-3">
          <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          {/* role="combobox" на самом поле ввода (jsx-a11y); список
              открывается при вводе — это поисковое поле, а не кнопка */}
          <Input
            role="combobox"
            aria-expanded={open}
            aria-controls={open ? listId : undefined}
            aria-autocomplete="list"
            disabled={disabled}
            value={query}
            placeholder={placeholder}
            className="h-9 border-0 bg-transparent px-0 focus-visible:ring-0 focus-visible:ring-offset-0"
            onFocus={() => setOpen(true)}
            onChange={(e) => {
              setQuery(e.target.value)
              setOpen(true)
            }}
            onKeyDown={onKeyDown}
          />
        </div>

        {open && (
          <div
            id={listId}
            className="absolute z-50 mt-1 w-full overflow-hidden rounded-md border bg-card shadow-md"
            role="listbox"
          >
            {manualCandidate && (
              <button
                type="button"
                role="option"
                aria-selected={value === manualCandidate}
                onMouseDown={(e) => {
                  e.preventDefault()
                  pick({ code: manualCandidate, name: '', etdDutyText: null })
                }}
                className={`flex w-full items-center gap-2 border-b bg-accent/30 px-3 py-1.5 text-left text-sm ${
                  options !== null && options.length === 0 ? '' : 'mb-1'
                }`}
              >
                <span className="w-24 shrink-0 font-mono text-xs">{manualCandidate}</span>
                <span className="truncate text-muted-foreground">
                  Код не из справочника — использовать как есть
                </span>
              </button>
            )}
            {loading && options === null && (
              <div className="flex items-center gap-2 px-3 py-4 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Поиск по справочнику…
              </div>
            )}
            {error && (
              <div className="px-3 py-3 text-sm text-destructive">{error}</div>
            )}
            {options !== null && !error && options.length === 0 && !loading && (
              <div className="px-3 py-3 text-sm text-muted-foreground">
                Не найдено: {query ? `«${query}»` : 'справочник пуст'}
              </div>
            )}
            {options !== null && options.length > 0 && (
              <div className="max-h-64 overflow-y-auto overscroll-contain py-1">
                {options.map((item, i) => (
                  <ComboOptionRow
                    key={item.code}
                    code={item.code}
                    codeClassName="w-24"
                    name={item.name}
                    selected={value === item.code}
                    active={i === active}
                    onPick={() => pick(item)}
                    // Подсказка ЕТТ — только показать, не подставлять
                    trailing={
                      <span className="ml-auto shrink-0 pl-2 font-mono text-xs text-muted-foreground">
                        {item.etdDutyText ?? ''}
                      </span>
                    }
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {value && (
        // Выбранное: код · наименование (· ставка) — видно без списка
        <div className="flex items-baseline gap-2 rounded-md bg-muted/50 px-2.5 py-1.5 text-xs">
          <span className="font-mono">{value}</span>
          <span className="truncate">{valueName ?? '—'}</span>
        </div>
      )}
    </div>
  )
}
