'use client'

import { useCallback, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { usePagedList } from '@/hooks/use-paged-list'
import { ListToolbar } from '@/components/admin/ListToolbar'
import { EmployeeCard } from './employee/EmployeeCard'
import { EmployeeCreateDialog } from './employee/EmployeeCreateDialog'
import { EmployeeEditDialog } from './employee/EmployeeEditDialog'
import { EmployeeResetPasswordDialog } from './employee/EmployeeResetPasswordDialog'
import { EMPLOYEE_SORTS, type EmployeeRow, type EmployeesPage } from './employee/types'

// ─── Сотрудники (Ж6в) — §4.2–4.3 ────────────────────────────────
// Справочник учётных записей кабинета: роли, стартовый пароль,
// деактивация, сброс пароля — только мастер (право защищает API,
// UI-блоки для себя/менеджера — удобство). Страница /admin/employees
// не-мастеру отдаёт заглушку ещё на сервере, меню не показывает
// пункт вовсе; этот компонент рендерится только мастеру.
//
// Две строки ограничений «на себя»: деактивировать себя и снимать
// с себя роль мастера нельзя (API вернёт 400 — кнопки честно
// заблокированы с подсказкой). Защита последнего мастера живёт
// в API: её клиенту не видно, отказ приходит понятным тостом.
//
// v0.5.0 (P1-22): шапка §4.2, карточка §4.3-lite (EmployeeCard),
// диалоги — employee/ (резка под лимит 300, RULES 2.14); пагинация —
// общий usePagedList (логика 1:1).

const PAGE_TAKE = 20

export function EmployeesList({ currentEmployeeId }: { currentEmployeeId: string }) {
  const [sort, setSort] = useState('name_asc')
  const [q, setQ] = useState('')
  const debouncedQ = useDebouncedValue(q, 400)
  const [editRow, setEditRow] = useState<EmployeeRow | null>(null)
  const [resetRow, setResetRow] = useState<EmployeeRow | null>(null)

  const fetchPage = useCallback(
    async (skip: number) => {
      const params = new URLSearchParams()
      params.set('take', String(PAGE_TAKE))
      if (debouncedQ) params.set('q', debouncedQ)
      if (sort !== 'name_asc') params.set('sort', sort)
      if (skip) params.set('skip', String(skip))
      const res = await fetch(`/api/admin/employees?${params.toString()}`)
      const data = (await res.json()) as EmployeesPage & { error?: string }
      if (!res.ok) throw new Error(data.error || 'Ошибка загрузки')
      return { items: data.employees, hasMore: data.hasMore, total: data.counts.all }
    },
    [debouncedQ, sort]
  )

  const { rows, hasMore, total, loading, loadingMore, loadMore, reload } = usePagedList<EmployeeRow>(
    fetchPage,
    'Не удалось загрузить сотрудников'
  )

  return (
    <div className="grid gap-4">
      {/* Шапка §4.2: заголовок + главное действие */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Сотрудники</h1>
          <p className="text-sm text-muted-foreground">
            Учётные записи кабинета: роли и доступ
            {total !== null ? ` · всего: ${total}` : ''}
          </p>
        </div>
        <EmployeeCreateDialog onCreated={reload} />
      </div>

      {/* Паттерн Ж4: поиск с крестиком + сортировка (§4.2) */}
      <ListToolbar
        q={q}
        onQChange={setQ}
        sort={sort}
        onSortChange={setSort}
        placeholder="Имя или телефон…"
        sorts={EMPLOYEE_SORTS}
      />

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm py-8 justify-center">
          <Loader2 className="size-4 animate-spin" />
          Загрузка…
        </div>
      ) : rows.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground text-sm">
          {q
            ? `Ничего не найдено по «${q}».`
            : 'Сотрудников пока нет — заведите первую учётную запись.'}
        </Card>
      ) : (
        <div className="grid gap-2">
          {rows.map((row) => (
            <EmployeeCard
              key={row.id}
              row={row}
              currentEmployeeId={currentEmployeeId}
              onEdit={setEditRow}
              onReset={setResetRow}
            />
          ))}
          {hasMore && (
            <Button variant="outline" onClick={loadMore} disabled={loadingMore}>
              {loadingMore && <Loader2 className="size-4 animate-spin" />}
              Показать ещё
            </Button>
          )}
        </div>
      )}

      <EmployeeEditDialog
        row={editRow}
        currentEmployeeId={currentEmployeeId}
        onClose={() => setEditRow(null)}
        onSaved={() => {
          setEditRow(null)
          reload()
        }}
      />
      <EmployeeResetPasswordDialog
        row={resetRow}
        currentEmployeeId={currentEmployeeId}
        onClose={() => setResetRow(null)}
        onSaved={() => {
          setResetRow(null)
          reload()
        }}
      />
    </div>
  )
}
