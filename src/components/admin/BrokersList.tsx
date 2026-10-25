'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'
import { readApiResponse } from '@/lib/api-client'
import { ListTabs } from '@/components/admin/ListTabs'
import { BrokerCard } from './broker/BrokerCard'
import { BrokerCreateDialog } from './broker/BrokerCreateDialog'
import { BrokerEditDialog } from './broker/BrokerEditDialog'
import type { BrokerFilter, BrokerRow } from './broker/types'

// ─── Справочник брокеров (Д) — §4.2–4.3 ─────────────────────────────
// GET ?active= / POST / PATCH — зеркало пула подрядчиков (Г3/Г5), но
// без воронки квалификации: брокер заводится напрямую, сразу с логином
// портала (телефон + пароль, нормализация на сервере). Деактивация —
// «доступ закрыт» (жёстче подрядчика: брокер — внешний участник, видит
// сделки целиком), связи со сделками не рвутся. DELETE не существует.
// v0.5.0 (P1-22): шапка §4.2 (заголовок + табы-фильтры + главное
// действие Coral), карточка §4.3-lite (BrokerCard), диалоги —
// broker/ (резка под лимит 300, RULES 2.14).

const FILTER_TABS: { key: BrokerFilter; label: string }[] = [
  { key: 'active', label: 'Действующие' },
  { key: 'inactive', label: 'Деактивированные' },
  { key: 'all', label: 'Все' },
]

const EMPTY_TEXT: Record<BrokerFilter, string> = {
  active: 'Действующих брокеров нет — добавьте первого.',
  inactive: 'Деактивированных брокеров нет.',
  all: 'Брокеров пока нет.',
}

export function BrokersList() {
  const { toast } = useToast()

  const [brokers, setBrokers] = useState<BrokerRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<BrokerFilter>('active')
  const [editing, setEditing] = useState<BrokerRow | null>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(
    async (f: BrokerFilter) => {
      setLoading(true)
      try {
        const url =
          f === 'all'
            ? '/api/admin/brokers'
            : `/api/admin/brokers?active=${f === 'active'}`
        const res = await fetch(url)
        const data = await readApiResponse<{ brokers: BrokerRow[]; error?: string }>(res)
        if (!res.ok) throw new Error(data.error || 'Ошибка загрузки')
        setBrokers(data.brokers)
      } catch (e) {
        toast({
          title: 'Не удалось загрузить справочник',
          description: e instanceof Error ? e.message : '',
          variant: 'destructive',
        })
      } finally {
        setLoading(false)
      }
    },
    [toast]
  )

  useEffect(() => {
    load(filter)
  }, [filter, load])

  const toggleActive = async (b: BrokerRow) => {
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/brokers/${b.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !b.isActive }),
      })
      const data = await readApiResponse<{ message?: string; error?: string }>(res)
      if (!res.ok) throw new Error(data.error || 'Не удалось изменить статус')
      toast({ title: data.message || 'Статус изменён' })
      load(filter)
    } catch (e) {
      toast({
        title: 'Ошибка',
        description: e instanceof Error ? e.message : '',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="grid gap-4">
      {/* Шапка §4.2: заголовок на странице, главное действие — здесь */}
      <div className="flex flex-wrap items-center justify-end gap-3">
        <BrokerCreateDialog onCreated={() => load(filter)} />
      </div>

      {/* Табы-фильтры §4.2 (без чисел: справочник отдаёт только отфильтрованный набор) */}
      <ListTabs
        tabs={FILTER_TABS}
        active={filter}
        onChange={(key) => setFilter(key as BrokerFilter)}
      />

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm py-8 justify-center">
          <Loader2 className="size-4 animate-spin" />
          Загрузка…
        </div>
      ) : brokers.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground text-sm">
          {EMPTY_TEXT[filter]}
        </Card>
      ) : (
        <div className="grid gap-2">
          {brokers.map((b) => (
            <BrokerCard
              key={b.id}
              broker={b}
              onEdit={setEditing}
              onToggleActive={toggleActive}
              saving={saving}
            />
          ))}
        </div>
      )}

      <BrokerEditDialog
        broker={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null)
          load(filter)
        }}
      />
    </div>
  )
}
