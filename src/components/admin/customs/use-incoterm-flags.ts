'use client'

import { useEffect, useState } from 'react'
import { incotermMetaOf } from '@/lib/ref'

// ─── DF-19: флаги правила условия поставки из справочника DF-17 ──────
// Клиентский источник — /api/ref/incoterm (тот же, что у
// IncotermPicker); правила — ДАННЫЕ, не код (D39/O-12). Список
// грузится один раз и кэшируется на уровне модуля.

export type IncotermFlags = {
  addFreightToArrival: boolean
  addInsurance: boolean
  deductPostArrival: boolean
}

// Умолчание до загрузки справочника — консервативно «фрахт добавляем»
// (EXW/FCA/FAS/FOB — самый частый кейс импорта); после загрузки флаги
// всегда точные по выбранному коду.
export const DEFAULT_FLAGS: IncotermFlags = {
  addFreightToArrival: true,
  addInsurance: true,
  deductPostArrival: false,
}

let flagsCache: Record<string, IncotermFlags> | null = null

export function useIncotermFlags(code: string): IncotermFlags {
  const [flags, setFlags] = useState<Record<string, IncotermFlags> | null>(flagsCache)

  useEffect(() => {
    if (flags) return
    let cancelled = false
    fetch('/api/ref/incoterm')
      .then(async (res) => {
        const body = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(body.error || 'Справочник недоступен')
        const map: Record<string, IncotermFlags> = {}
        for (const item of (body.items ?? []) as { code: string; meta: unknown }[]) {
          const m = incotermMetaOf(item.meta)
          if (m) {
            map[item.code] = {
              addFreightToArrival: m.addFreightToArrival === true,
              addInsurance: m.addInsurance === true,
              deductPostArrival: m.deductPostArrival === true,
            }
          }
        }
        flagsCache = map
        if (!cancelled) setFlags(map)
      })
      .catch(() => {
        if (!cancelled) setFlags({})
      })
    return () => {
      cancelled = true
    }
  }, [flags])

  return (code && flags?.[code]) || DEFAULT_FLAGS
}
