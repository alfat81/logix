'use client'

import { useCallback, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { usePagedList } from '@/hooks/use-paged-list'
import { ListToolbar } from '@/components/admin/ListToolbar'
import { LegalEntityCard } from './legalentity/LegalEntityCard'
import { LegalEntityCreateDialog } from './legalentity/LegalEntityCreateDialog'
import { LegalEntityEditDialog } from './legalentity/LegalEntityEditDialog'
import {
  LEGAL_ENTITY_SORTS,
  type LegalEntityRow,
  type LegalEntitiesPage,
} from './legalentity/types'

// ─── Юрлица (Ж6б) — §4.2–4.3 ────────────────────────────────────
// Справочник наших компаний: название + реквизиты для печатных форм
// (свободная Json-структура — роадмап «не фиксировать до реальных
// форм», поэтому поля формы описаны отдельно и сохраняются только
// заполненные). Поиск — по названию и реквизитам (ИНН и др.),
// счётчики — договоры и заявки. Правка и создание — в диалогах,
// отдельной страницы-карточки нет: справочник плоский.
//
// Деактивация: неактивное скрывается из выбора при создании заявки,
// но остаётся в старых договорах и заявках — историю не переписываем.
//
// v0.5.0 (P1-22): шапка §4.2, карточка §4.3-lite (LegalEntityCard),
// диалоги — legalentity/ (резка под лимит 300, RULES 2.14); пагинация
// — общий usePagedList (логика 1:1).

const PAGE_TAKE = 20

export function LegalEntitiesList() {
  const [sort, setSort] = useState('name_asc')
  const [q, setQ] = useState('')
  const debouncedQ = useDebouncedValue(q, 400)
  const [editRow, setEditRow] = useState<LegalEntityRow | null>(null)

  // take шлём ВСЕГДА: без параметров роут отдаёт легаси-справочник
  // для Select'а создания заявки (только активные) — как в Ж6а.
  const fetchPage = useCallback(
    async (skip: number) => {
      const params = new URLSearchParams()
      params.set('take', String(PAGE_TAKE))
      if (debouncedQ) params.set('q', debouncedQ)
      if (sort !== 'name_asc') params.set('sort', sort)
      if (skip) params.set('skip', String(skip))
      const res = await fetch(`/api/admin/legal-entities?${params.toString()}`)
      const data = (await res.json()) as LegalEntitiesPage & { error?: string }
      if (!res.ok) throw new Error(data.error || 'Ошибка загрузки')
      return { items: data.legalEntities, hasMore: data.hasMore, total: data.counts.all }
    },
    [debouncedQ, sort]
  )

  const { rows, hasMore, total, loading, loadingMore, loadMore, reload } =
    usePagedList<LegalEntityRow>(fetchPage, 'Не удалось загрузить юрлица')

  return (
    <div className="grid gap-4">
      {/* Шапка §4.2: заголовок + главное действие */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Юрлица</h1>
          <p className="text-sm text-muted-foreground">
            Наши компании и их реквизиты для печатных форм
            {total !== null ? ` · всего: ${total}` : ''}
          </p>
        </div>
        <LegalEntityCreateDialog onCreated={reload} />
      </div>

      {/* Паттерн Ж4: поиск с крестиком + сортировка (§4.2) */}
      <ListToolbar
        q={q}
        onQChange={setQ}
        sort={sort}
        onSortChange={setSort}
        placeholder="Название, ИНН, адрес, банк…"
        sorts={LEGAL_ENTITY_SORTS}
      />

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm py-8 justify-center">
          <Loader2 className="size-4 animate-spin" />
          Загрузка…
        </div>
      ) : rows.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground text-sm">
          {q ? `Ничего не найдено по «${q}».` : 'Юрлиц пока нет — заведите первое.'}
        </Card>
      ) : (
        <div className="grid gap-2">
          {rows.map((row) => (
            <LegalEntityCard key={row.id} row={row} onEdit={setEditRow} />
          ))}
          {hasMore && (
            <Button variant="outline" onClick={loadMore} disabled={loadingMore}>
              {loadingMore && <Loader2 className="size-4 animate-spin" />}
              Показать ещё
            </Button>
          )}
        </div>
      )}

      <LegalEntityEditDialog
        row={editRow}
        onClose={() => setEditRow(null)}
        onSaved={() => {
          setEditRow(null)
          reload()
        }}
      />
    </div>
  )
}
