'use client'

import { useCallback, useEffect, useState } from 'react'
import { useToast } from '@/hooks/use-toast'
import { readApiResponse } from '@/lib/api-client'

// ─── Загрузка сводки API для экранов-дашбордов (Ж5, DF-07) ───────────
// Один и тот же паттерн у «Требует внимания» и «Пульса»: fetch →
// readApiResponse → тост при ошибке → данные в стейте, повтор кнопкой.
// Хук убирает копию (IC-14: 12-строчные окна) — экраны получают
// данные/состояния и больше ничего не знают про транспорт.
export function useApiData<T>(url: string, errorTitle: string) {
  const { toast } = useToast()
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch(url)
      const body = await readApiResponse<T & { error?: string }>(res)
      if (!res.ok) throw new Error(body.error || 'Ошибка загрузки')
      setData(body)
    } catch (e) {
      toast({
        title: errorTitle,
        description: e instanceof Error ? e.message : '',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [toast, url, errorTitle])

  useEffect(() => {
    load()
  }, [load])

  const reload = useCallback(() => {
    setRefreshing(true)
    load()
  }, [load])

  return { data, loading, refreshing, reload }
}
