'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, Pencil, Users } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'
import { readApiResponse } from '@/lib/api-client'
import { ListTabs } from '@/components/admin/ListTabs'
import {
  COMPETENCIES_DIRECTIONS_KEY,
  COMPETENCIES_TRANSPORT_KEY,
  readInfoString,
  readTransportChips,
} from '@/lib/contractors'
import { ContractorPoolEditDialog } from './contractorpool/ContractorPoolEditDialog'
import { fmtPoolDate, type ContractorRow, type PoolFilter } from './contractorpool/types'

// ─── Пул подрядчиков (Г5) ──────────────────────────────────────────
// Справочник Contractor (Г3): GET ?active= витрина пула против
// исключённых. Правка профиля — PATCH, компетенции — чипы
// TRANSPORT_TYPES, договорные поля/комментарий пустой строкой
// осознанно очищаются (паттерн incoterm Б3). Исключение из пула —
// МЯГКОЕ (isActive=false): на новые этапы не назначается, но вход в
// ЛК и текущие назначения живут; DELETE у справочника нет вовсе.
//
// v0.5.0 (P1-22): диалог правки/исключения — выезд в contractorpool/
// (резка под лимит 300, RULES 2.14).
// v0.7.10 (DF-22): секция — эталонная обёртка Card, фильтры — общий
// ListTabs (§4.2); карточка — анатомия §4.3-lite по эталону «Юрлица»:
// строка 1 — «с {дата}» + бейдж состояния, строка 2 — название
// semibold, строка 3 — телефон/договор; справа — счётчик этапов и
// компетенции-чипы.
export function ContractorPoolSection({
  refreshKey = 0,
  portalEnabled,
  onContractorChanged,
}: {
  refreshKey?: number
  // D31 (DF-00C): флаг заморозки кабинета — в диалог выдачи доступа
  portalEnabled: boolean
  onContractorChanged?: () => void
}) {
  const { toast } = useToast()

  const [contractors, setContractors] = useState<ContractorRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<PoolFilter>('active')

  // Диалог правки профиля (форма живёт в диалоге)
  const [selected, setSelected] = useState<ContractorRow | null>(null)

  const load = useCallback(
    async (f: PoolFilter) => {
      setLoading(true)
      try {
        const url =
          f === 'all'
            ? '/api/admin/contractors'
            : `/api/admin/contractors?active=${f === 'active'}`
        const res = await fetch(url)
        const data = await readApiResponse<{ contractors: ContractorRow[]; error?: string }>(res)
        if (!res.ok) throw new Error(data.error || 'Ошибка загрузки')
        setContractors(data.contractors)
      } catch (e) {
        toast({
          title: 'Не удалось загрузить пул',
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
  }, [filter, load, refreshKey])

  return (
    <section>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="size-4 text-muted-foreground" />
            Пул
          </CardTitle>
          <CardDescription>
            Квалифицированные исполнители. Исключение — мягкое: новые назначения блокируются,
            текущие этапы и вход в ЛК живут
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <ListTabs
            tabs={[
              { key: 'active', label: 'В пуле' },
              { key: 'excluded', label: 'Исключённые' },
              { key: 'all', label: 'Все' },
            ]}
            active={filter}
            onChange={(k) => setFilter(k as PoolFilter)}
          />

          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm py-6 justify-center">
              <Loader2 className="size-4 animate-spin" />
              Загрузка…
            </div>
          ) : contractors.length === 0 ? (
            <span className="text-center text-muted-foreground text-sm py-2">
              {filter === 'active'
                ? 'Пул пуст — переведите первого кандидата в квалификации.'
                : filter === 'excluded'
                  ? 'Исключённых подрядчиков нет.'
                  : 'Подрядчиков пока нет.'}
            </span>
          ) : (
            <div className="grid gap-2">
              {contractors.map((c) => {
                const chips = readTransportChips((c.competencies ?? {})[COMPETENCIES_TRANSPORT_KEY])
                const directions = readInfoString((c.competencies ?? {})[COMPETENCIES_DIRECTIONS_KEY])
                return (
                  <Card
                    key={c.id}
                    className="p-4 cursor-pointer transition-colors hover:border-ring"
                    onClick={() => setSelected(c)}
                  >
                    {/* Анатомия §4.3-lite (эталон — «Юрлица») */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2 text-sm">
                          <span className="text-muted-foreground tabular-nums">
                            с {fmtPoolDate(c.createdAt)}
                          </span>
                          {c.isActive ? (
                            <Badge variant="delivered">в пуле</Badge>
                          ) : (
                            <Badge variant="version">исключён</Badge>
                          )}
                        </div>
                        <div className="mt-0.5 truncate font-semibold">{c.companyName}</div>
                        <div className="mt-0.5 truncate text-sm text-muted-foreground">
                          {c.phone}
                          {c.contractNumber ? ` · договор № ${c.contractNumber}` : ''}
                          {c.contractSignedAt ? ` от ${fmtPoolDate(c.contractSignedAt)}` : ''}
                        </div>
                        {c.comment && (
                          <div className="mt-0.5 truncate text-xs text-muted-foreground">{c.comment}</div>
                        )}
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-sm font-semibold tabular-nums">
                          {c._count.stages > 0 ? `${c._count.stages} этап(ов) назначено` : 'без назначений'}
                        </div>
                        <div className="mt-1 flex max-w-56 flex-wrap justify-end gap-1">
                          {chips.length ? (
                            chips.map((t) => (
                              <Badge key={t} variant="outline" className="text-xs">
                                {t}
                              </Badge>
                            ))
                          ) : (
                            <span className="text-xs text-muted-foreground">компетенции не указаны</span>
                          )}
                        </div>
                        {directions && (
                          <div className="mt-0.5 truncate text-xs text-muted-foreground">{directions}</div>
                        )}
                        <Pencil className="mt-1 ml-auto size-4 text-muted-foreground" />
                      </div>
                    </div>
                  </Card>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <ContractorPoolEditDialog
        contractor={selected}
        portalEnabled={portalEnabled}
        onClose={() => setSelected(null)}
        onSaved={() => {
          setSelected(null)
          load(filter)
        }}
        onReloaded={() => load(filter)}
        onRowFresh={setSelected}
        onContractorChanged={onContractorChanged}
      />
    </section>
  )
}
