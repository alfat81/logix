'use client'

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, Loader2, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { matchRefOptions, type RefDir } from '@/lib/ref'

// ─── DF-17: Combobox справочника (IC-16) ────────────────────────────
// Единый компонент выбора из справочника для всех форм (страна, валюта,
// упаковка, условие поставки): поиск при вводе (по коду, русскому и
// английскому имени — matchRefOptions), клавиатура (стрелки/Enter/Esc),
// 375 px (список на всю ширину поля). Значением хранится КОД справочника;
// подпись берётся из справочника (карточка DF-17).
//
// Режимы:
//  • обычный — выбор кода, очистка (allowClear);
//  • allowOther — вариант «Другое…» переключает на свободный текст
//    (упаковка/места: справочник не отвечает составу грузов; код при
//    этом пустой — текст пишется как есть).
//
// Список — один fetch /api/ref/{dir} на монтирование (кэш в компоненте);
// фильтрация локальная (справочники DF-17 малы: ≤ 250 стран).

export type RefPick = { code: string; name: string } | { code: null; text: string } | null

type RefItemOption = { id: string; code: string; name: string; nameEn: string | null }

export function ReferenceCombobox({
  dir,
  value,
  onPick,
  label,
  placeholder = 'Начните вводить…',
  allowClear = false,
  allowOther = false,
  otherText = 'Другое…',
  disabled = false,
  className,
}: {
  dir: RefDir
  // Текущее значение: код справочника либо свободный текст (allowOther)
  value: string
  onPick: (pick: RefPick) => void
  label?: string
  placeholder?: string
  allowClear?: boolean
  allowOther?: boolean
  otherText?: string
  disabled?: boolean
  className?: string
}) {
  const [items, setItems] = useState<RefItemOption[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const boxRef = useRef<HTMLDivElement | null>(null)
  // aria-controls/aria-expanded (jsx-a11y, role="combobox"): id списка
  // уникален на инстанс — на карточке бывает несколько Combobox.
  const listId = useId()

  useEffect(() => {
    let cancelled = false
    setItems(null)
    setLoadError(null)
    fetch(`/api/ref/${dir}`)
      .then(async (res) => {
        const body = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(body.error || 'Справочник недоступен')
        if (!cancelled) setItems(body.items ?? [])
      })
      .catch((e) => {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : 'Ошибка загрузки')
      })
    return () => {
      cancelled = true
    }
  }, [dir])

  // Закрытие по клику вне (Escape — в keydown списка)
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const filtered = useMemo(
    () => (items ? matchRefOptions(items, query).slice(0, 100) : []),
    [items, query]
  )

  // Отображение текущего значения: имя по коду (из справочника) либо
  // свободный текст как есть; код без имени (отключённую запись) — кодом.
  const selectedName = useMemo(() => {
    if (!value) return ''
    const byCode = items?.find((i) => i.code === value)
    return byCode ? byCode.name : value
  }, [items, value])

  const openList = () => {
    if (disabled) return
    setQuery('')
    setActive(0)
    setOpen(true)
  }

  const pick = (item: RefItemOption) => {
    onPick({ code: item.code, name: item.name })
    setOpen(false)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === 'Enter' || e.key === 'ArrowDown') {
        e.preventDefault()
        openList()
      }
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => Math.min(a + 1, Math.max(filtered.length - 1, 0)))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(a - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (allowOther && active >= filtered.length) {
        // «Другое…» — переключение на свободный текст
        onPick({ code: null, text: value })
        return
      }
      const item = filtered[active]
      if (item) pick(item)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setOpen(false)
    }
  }

  return (
    <div className={`grid gap-1.5 ${className ?? ''}`} ref={boxRef}>
      {label && <Label className="text-xs text-muted-foreground">{label}</Label>}
      <div className="relative">
        {open && allowOther ? (
          // Свободный текст после «Другое…»: ввод сохраняется как есть
          <Input
            autoFocus
            value={value}
            placeholder="Свой вариант — впишите текст"
            onChange={(e) => onPick({ code: null, text: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Escape' || e.key === 'Enter') {
                e.preventDefault()
                setOpen(false)
              }
            }}
          />
        ) : (
          <button
            type="button"
            role="combobox"
            aria-expanded={open}
            aria-controls={open ? listId : undefined}
            disabled={disabled}
            onClick={() => (open ? setOpen(false) : openList())}
            onKeyDown={onKeyDown}
            className="flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-card px-3 text-left text-sm disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className={selectedName ? 'truncate' : 'truncate text-muted-foreground'}>
              {selectedName || placeholder}
            </span>
            <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
          </button>
        )}

        {open && (
          <div
            id={listId}
            className="absolute z-50 mt-1 w-full min-w-56 overflow-hidden rounded-md border bg-card shadow-md"
            role="listbox"
          >
            {items === null ? (
              <div className="flex items-center gap-2 px-3 py-4 text-sm text-muted-foreground">
                {loadError ? (
                  <span className="text-destructive">{loadError}</span>
                ) : (
                  <>
                    <Loader2 className="size-4 animate-spin" /> Загрузка справочника…
                  </>
                )}
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 border-b px-2.5 py-2">
                  <Search className="size-4 shrink-0 text-muted-foreground" />
                  <input
                    autoFocus
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value)
                      setActive(0)
                    }}
                    onKeyDown={onKeyDown}
                    placeholder="Код или название…"
                    className="h-6 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                    aria-label="Поиск по справочнику"
                  />
                </div>
                <div className="max-h-64 overflow-y-auto overscroll-contain py-1">
                  {filtered.length === 0 && !allowOther && (
                    <div className="px-3 py-3 text-sm text-muted-foreground">Ничего не найдено</div>
                  )}
                  {filtered.map((item, i) => (
                    <button
                      key={item.code}
                      type="button"
                      role="option"
                      aria-selected={value === item.code}
                      onMouseDown={(e) => {
                        // mousedown: до blur родителя — иначе клик теряется
                        e.preventDefault()
                        pick(item)
                      }}
                      className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm ${
                        i === active ? 'bg-accent/60' : ''
                      }`}
                    >
                      <span className="w-12 shrink-0 font-mono text-xs text-muted-foreground">
                        {item.code}
                      </span>
                      <span className="truncate">{item.name}</span>
                      {value === item.code && <Check className="ml-auto size-4 shrink-0 text-primary" />}
                    </button>
                  ))}
                  {allowOther && (
                    <button
                      type="button"
                      role="option"
                      aria-selected={active >= filtered.length}
                      onMouseDown={(e) => {
                        e.preventDefault()
                        onPick({ code: null, text: value })
                        setOpen(false)
                      }}
                      className={`flex w-full items-center px-3 py-1.5 text-left text-sm text-muted-foreground ${
                        active >= filtered.length ? 'bg-accent/60' : ''
                      }`}
                    >
                      {otherText} — свой вариант текстом
                    </button>
                  )}
                </div>
                {allowClear && value && (
                  <div className="border-t p-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="w-full justify-start text-muted-foreground"
                      onMouseDown={(e) => {
                        e.preventDefault()
                        onPick(null)
                        setOpen(false)
                      }}
                    >
                      Очистить
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
