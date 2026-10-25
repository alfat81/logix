'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useToast } from '@/hooks/use-toast'

// v0.5.0 (P1-22): общий хук пагинации справочников «take/skip + ?q= +
// сортировка» — выезд из CustomersList/EmployeesList/LegalEntitiesList
// (резка под лимит 300, RULES 2.14). Логика 1:1 с прежними списками:
// страж гонок reqId (применяется только последний ответ), version
// (перезагрузка после создания/правки без копирования load-логики),
// «Показать ещё» с дописыванием страницы. fetchPage передаётся
// мемоизированным (useCallback по q/sort) — смена идентичности
// перезапускает загрузку первой страницы.
export type PagedPage<T> = { items: T[]; hasMore: boolean; total: number | null }

export function usePagedList<T>(
  fetchPage: (skip: number) => Promise<PagedPage<T>>,
  errorTitle: string
) {
  const { toast } = useToast()

  const [rows, setRows] = useState<T[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [total, setTotal] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [version, setVersion] = useState(0)
  const reqId = useRef(0)

  useEffect(() => {
    const id = ++reqId.current
    setLoading(true)
    fetchPage(0)
      .then((data) => {
        if (id !== reqId.current) return
        setRows(data.items)
        setHasMore(data.hasMore)
        setTotal(data.total)
      })
      .catch((e) => {
        if (id !== reqId.current) return
        toast({
          title: errorTitle,
          description: e instanceof Error ? e.message : '',
          variant: 'destructive',
        })
      })
      .finally(() => {
        if (id === reqId.current) setLoading(false)
      })
  }, [fetchPage, version, errorTitle, toast])

  const loadMore = useCallback(async () => {
    if (loadingMore) return
    setLoadingMore(true)
    try {
      // rows намеренно не в зависимостях: к моменту клика это
      // актуальная длина (клик возможен только после первой страницы)
      const data = await fetchPage(rows.length)
      setRows((prev) => [...prev, ...data.items])
      setHasMore(data.hasMore)
    } catch (e) {
      toast({
        title: errorTitle,
        description: e instanceof Error ? e.message : '',
        variant: 'destructive',
      })
    } finally {
      setLoadingMore(false)
    }
  }, [fetchPage, rows.length, loadingMore, errorTitle, toast])

  const reload = useCallback(() => setVersion((v) => v + 1), [])

  return { rows, hasMore, total, loading, loadingMore, loadMore, reload }
}
